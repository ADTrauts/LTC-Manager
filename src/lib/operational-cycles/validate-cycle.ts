import type {
  MealType,
  OperationalCycleLocationMode,
  OperationalCycleNodeKind,
  OperationalCycleType,
  ServeryMilestone,
  UnitType,
} from "@prisma/client";

import { isStandardRoomTypeKey } from "./cycle-scope";
import { effectiveDateRangesOverlap } from "./cycle-lifecycle";
import {
  isStructurallyOvernight,
  parseLocalTime,
  resolveCycleWindowInstants,
  weekdaySetsIntersect,
  windowsOverlap,
} from "./cycle-windows";
import type { CycleValidationIssue, CycleValidationResult, KeyTimeGroupDefinition } from "./types";

export type ValidateCycleInput = {
  label: string;
  cycleType: OperationalCycleType;
  nodeKind?: OperationalCycleNodeKind;
  parentStableKey?: string | null;
  startLocal?: string | null;
  endLocal?: string | null;
  overnight?: boolean;
  applicableDaysOfWeek: number[];
  effectiveFrom: string | null | undefined;
  mealType?: MealType | null;
  locationMode: OperationalCycleLocationMode;
  locationInheritFromParent?: boolean;
  applicableUnitTypes?: UnitType[];
  applicableOperationalTypeKeys?: string[];
  unitIds?: string[];
  spaceIds?: string[];
  keyTimeGroups?: KeyTimeGroupDefinition[];
  roomTypeKey?: string | null;
  expectedMilestones?: ServeryMilestone[];
  /** When true, SERVICE without mealType is an error; otherwise a warning. */
  forPublish?: boolean;
};

export type PublishedCycleOverlapCandidate = {
  id: string;
  label: string;
  nodeKind?: OperationalCycleNodeKind;
  startLocal: string | null;
  endLocal: string | null;
  overnight: boolean;
  applicableDaysOfWeek: number[];
  locationMode: OperationalCycleLocationMode;
  applicableUnitTypes: UnitType[];
  unitIds: string[];
  /** YYYY-MM-DD — when set with peer ranges, only overlapping effective windows conflict. */
  effectiveFrom?: string;
  effectiveTo?: string | null;
  stableKey?: string;
};

function issue(
  code: string,
  message: string,
  severity: "error" | "warning",
): CycleValidationIssue {
  return { code, message, severity };
}

function normalizedNodeKind(input: ValidateCycleInput): OperationalCycleNodeKind {
  return input.nodeKind ?? "PERIOD";
}

function hasLegacyRoomTypeScope(input: ValidateCycleInput): boolean {
  return input.locationMode === "ROOM_TYPE" && Boolean(input.roomTypeKey?.trim());
}

/** Location scopes intersect when both could apply to the same unit. */
export function locationScopesIntersect(
  a: Pick<PublishedCycleOverlapCandidate, "locationMode" | "applicableUnitTypes" | "unitIds">,
  b: Pick<PublishedCycleOverlapCandidate, "locationMode" | "applicableUnitTypes" | "unitIds">,
): boolean {
  if (a.locationMode === "ALL_DEPARTMENT_UNITS" || b.locationMode === "ALL_DEPARTMENT_UNITS") {
    return true;
  }

  if (a.locationMode === "UNIT_TYPES" && b.locationMode === "UNIT_TYPES") {
    const setB = new Set(b.applicableUnitTypes);
    return a.applicableUnitTypes.some((t) => setB.has(t));
  }

  if (a.locationMode === "EXPLICIT_UNITS" && b.locationMode === "EXPLICIT_UNITS") {
    const setB = new Set(b.unitIds);
    return a.unitIds.some((id) => setB.has(id));
  }

  // UNIT_TYPES vs EXPLICIT_UNITS — cannot decide without unit rows; treat as intersecting
  // so publish stays conservative when scopes may collide.
  return true;
}

/**
 * Detect clock-overlapping published cycles that share applicable days and location scope.
 *
 * Distinct cycles MAY overlap in wall-clock time (prep vs service is legitimate).
 * This helper remains for diagnostics / informational warnings — it is not a publish blocker.
 * Same-stableKey peers are ignored (supersede path, not a concurrent overlap).
 */
export function findOverlappingPublishedCycles(
  candidate: PublishedCycleOverlapCandidate,
  others: readonly PublishedCycleOverlapCandidate[],
  facilityTimezone?: string | null,
  operationalDateKey = "2099-06-15",
): PublishedCycleOverlapCandidate[] {
  if (candidate.nodeKind === "KEY_TIME") return [];
  if (!candidate.startLocal?.trim() || !candidate.endLocal?.trim()) return [];

  if (
    candidate.overnight ||
    isStructurallyOvernight(candidate.startLocal, candidate.endLocal, false)
  ) {
    return [];
  }

  const candidateWindow = resolveCycleWindowInstants({
    operationalDateKey,
    startLocal: candidate.startLocal,
    endLocal: candidate.endLocal,
    overnight: false,
    facilityTimezone,
  });
  if (!candidateWindow) return [];

  const overlaps: PublishedCycleOverlapCandidate[] = [];
  for (const other of others) {
    if (other.id === candidate.id) continue;
    if (other.nodeKind === "KEY_TIME") continue;
    if (!other.startLocal?.trim() || !other.endLocal?.trim()) continue;
    if (
      candidate.stableKey &&
      other.stableKey &&
      candidate.stableKey === other.stableKey
    ) {
      // Same logical cycle — supersede path, not a concurrent overlap.
      continue;
    }
    if (
      candidate.effectiveFrom &&
      other.effectiveFrom &&
      !effectiveDateRangesOverlap(
        candidate.effectiveFrom,
        candidate.effectiveTo,
        other.effectiveFrom,
        other.effectiveTo,
      )
    ) {
      continue;
    }
    if (
      other.overnight ||
      isStructurallyOvernight(other.startLocal, other.endLocal, false)
    ) {
      continue;
    }
    if (!weekdaySetsIntersect(candidate.applicableDaysOfWeek, other.applicableDaysOfWeek)) {
      continue;
    }
    if (!locationScopesIntersect(candidate, other)) continue;

    const otherWindow = resolveCycleWindowInstants({
      operationalDateKey,
      startLocal: other.startLocal,
      endLocal: other.endLocal,
      overnight: false,
      facilityTimezone,
    });
    if (!otherWindow) continue;

    if (
      windowsOverlap(
        candidateWindow.startsAt,
        candidateWindow.endsAt,
        otherWindow.startsAt,
        otherWindow.endsAt,
      )
    ) {
      overlaps.push(other);
    }
  }
  return overlaps;
}

function validateKeyTimeGroups(
  groups: KeyTimeGroupDefinition[] | undefined,
  errors: CycleValidationIssue[],
  forPublish: boolean,
): void {
  const list = groups ?? [];
  if (forPublish && list.length === 0) {
    errors.push(
      issue(
        "key_time_groups_required",
        "Add at least one due-time group and select the Rooms it applies to.",
        "error",
      ),
    );
    return;
  }

  const seenRooms = new Map<string, string>();
  for (const group of list) {
    const due = parseLocalTime(group.dueLocal);
    if (!due) {
      errors.push(
        issue(
          "key_time_due_invalid",
          "Each Key Time group requires a due time (HH:mm).",
          "error",
        ),
      );
      continue;
    }
    const spaceIds = (group.spaceIds ?? []).filter(Boolean);
    if (forPublish && spaceIds.length === 0) {
      errors.push(
        issue(
          "key_time_group_rooms_required",
          `Select at least one Room for the ${group.dueLocal} due-time group, or remove this empty group.`,
          "error",
        ),
      );
      continue;
    }
    for (const spaceId of spaceIds) {
      if (seenRooms.has(spaceId)) {
        errors.push(
          issue(
            "key_time_room_duplicate",
            "A Room can only have one due time within this Key Time.",
            "error",
          ),
        );
        return;
      }
      seenRooms.set(spaceId, group.dueLocal);
    }
  }
}

/**
 * Validate a cycle draft or publish payload.
 * Does not invent a "Blocked" status — callers use errors/warnings only.
 */
export function validateCycle(input: ValidateCycleInput): CycleValidationResult {
  const errors: CycleValidationIssue[] = [];
  const warnings: CycleValidationIssue[] = [];
  const forPublish = input.forPublish === true;
  const nodeKind = normalizedNodeKind(input);
  const parentStableKey = input.parentStableKey?.trim() || null;
  const inherit = input.locationInheritFromParent === true;
  const isTopLevel = !parentStableKey;

  if (!input.label?.trim()) {
    errors.push(issue("label_required", "Cycle label is required.", "error"));
  }

  if (nodeKind === "KEY_TIME") {
    if (isTopLevel) {
      errors.push(
        issue(
          "key_time_parent_required",
          "A Key Time must belong to an Operational Cycle such as Lunch or Breakfast.",
          "error",
        ),
      );
    }
    if (input.startLocal?.trim() || input.endLocal?.trim()) {
      errors.push(
        issue(
          "key_time_no_duration",
          "Key Time nodes do not use start/end windows.",
          "error",
        ),
      );
    }
    validateKeyTimeGroups(input.keyTimeGroups, errors, forPublish);
  } else {
    const start = parseLocalTime(input.startLocal ?? "");
    const end = parseLocalTime(input.endLocal ?? "");
    if (!start) {
      errors.push(issue("start_required", "Start time is required and must be HH:mm.", "error"));
    }
    if (!end) {
      errors.push(issue("end_required", "End time is required and must be HH:mm.", "error"));
    }

    const overnight = input.overnight ?? false;
    if (start && end) {
      const startMin = start.hours * 60 + start.minutes;
      const endMin = end.hours * 60 + end.minutes;
      if (!overnight && endMin <= startMin) {
        errors.push(
          issue(
            "end_before_start",
            "End time must be after start time unless the cycle is overnight.",
            "error",
          ),
        );
      }
    }

    if (inherit) {
      if (isTopLevel) {
        errors.push(
          issue(
            "inherit_top_level",
            "Top-level phases cannot inherit locations from a parent.",
            "error",
          ),
        );
      }
    } else if (input.locationMode === "EXPLICIT_UNITS" && !hasLegacyRoomTypeScope(input)) {
      const unitCount = input.unitIds?.length ?? 0;
      const spaceCount = input.spaceIds?.length ?? 0;
      if (unitCount + spaceCount === 0) {
        const msg = isTopLevel
          ? "Choose at least one Room for this Operational Cycle."
          : "Choose at least one Room, or use the parent locations.";
        if (forPublish) {
          errors.push(issue("explicit_locations_required", msg, "error"));
        } else {
          warnings.push(issue("explicit_locations_empty", msg, "warning"));
        }
      }
    }
  }

  if (inherit && nodeKind !== "PERIOD") {
    errors.push(
      issue(
        "inherit_period_only",
        "Location inheritance is only available for nested phases.",
        "error",
      ),
    );
  }

  if (!input.applicableDaysOfWeek || input.applicableDaysOfWeek.length === 0) {
    errors.push(issue("days_required", "At least one applicable day of week is required.", "error"));
  } else {
    for (const day of input.applicableDaysOfWeek) {
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        errors.push(issue("days_invalid", "Applicable days must be integers 0 (Sunday) through 6.", "error"));
        break;
      }
    }
  }

  if (!input.effectiveFrom?.trim()) {
    errors.push(issue("effective_from_required", "Effective from date is required.", "error"));
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom.trim())) {
    errors.push(issue("effective_from_format", "Effective from must be YYYY-MM-DD.", "error"));
  }

  if (input.cycleType === "SERVICE") {
    if (!input.mealType) {
      const msg = "SERVICE cycles should reference a meal type.";
      if (forPublish) {
        errors.push(issue("service_meal_required", msg, "error"));
      } else {
        warnings.push(issue("service_meal_missing", msg, "warning"));
      }
    }
  } else if (input.expectedMilestones && input.expectedMilestones.length > 0) {
    warnings.push(
      issue(
        "milestones_non_service",
        "Expected milestones are only meaningful for SERVICE cycles.",
        "warning",
      ),
    );
  }

  if (hasLegacyRoomTypeScope(input)) {
    const key = input.roomTypeKey?.trim() ?? "";
    if (!isStandardRoomTypeKey(key)) {
      errors.push(
        issue(
          "room_type_required",
          "Room Type scope requires a standard Facility Room Type.",
          "error",
        ),
      );
    }
  }

  if (input.locationMode === "UNIT_TYPES") {
    if (!input.applicableUnitTypes || input.applicableUnitTypes.length === 0) {
      errors.push(
        issue("unit_types_required", "Unit-type location mode requires at least one unit type.", "error"),
      );
    }
  }

  if (input.locationMode === "OPERATIONAL_TYPES") {
    const keys = (input.applicableOperationalTypeKeys ?? []).map((key) => key.trim()).filter(Boolean);
    if (keys.length === 0) {
      const msg = "Choose at least one Operational Type for this cycle.";
      if (forPublish) {
        errors.push(issue("operational_types_required", msg, "error"));
      } else {
        warnings.push(issue("operational_types_empty", msg, "warning"));
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateCycleForPublish(
  input: ValidateCycleInput & {
    stableKey?: string;
    effectiveTo?: string | null;
  },
  publishedPeers: readonly PublishedCycleOverlapCandidate[],
  facilityTimezone?: string | null,
): CycleValidationResult {
  const base = validateCycle({ ...input, forPublish: true });
  const errors = [...base.errors];
  const warnings = [...base.warnings];

  if (base.valid && normalizedNodeKind(input) === "PERIOD") {
    const startLocal = input.startLocal?.trim() ?? "";
    const endLocal = input.endLocal?.trim() ?? "";
    if (startLocal && endLocal) {
      const candidate: PublishedCycleOverlapCandidate = {
        id: "__publishing__",
        label: input.label,
        nodeKind: "PERIOD",
        startLocal,
        endLocal,
        overnight: input.overnight ?? false,
        applicableDaysOfWeek: input.applicableDaysOfWeek,
        locationMode: input.locationMode,
        applicableUnitTypes: input.applicableUnitTypes ?? [],
        unitIds: input.unitIds ?? [],
        effectiveFrom: input.effectiveFrom?.trim() || undefined,
        effectiveTo: input.effectiveTo ?? null,
        stableKey: input.stableKey,
      };
      const overlaps = findOverlappingPublishedCycles(candidate, publishedPeers, facilityTimezone);
      for (const overlap of overlaps) {
        warnings.push(
          issue(
            "overlap_published",
            `Overlaps published cycle "${overlap.label}" on a shared day and location scope. Distinct cycles may overlap when operations require it.`,
            "warning",
          ),
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
