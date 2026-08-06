import type {
  MealType,
  OperationalCycleLocationMode,
  OperationalCycleType,
  ServeryMilestone,
  UnitType,
} from "@prisma/client";

import {
  isStructurallyOvernight,
  parseLocalTime,
  resolveCycleWindowInstants,
  weekdaySetsIntersect,
  windowsOverlap,
} from "./cycle-windows";
import type { CycleValidationIssue, CycleValidationResult } from "./types";

export type ValidateCycleInput = {
  label: string;
  cycleType: OperationalCycleType;
  startLocal: string;
  endLocal: string;
  overnight?: boolean;
  applicableDaysOfWeek: number[];
  effectiveFrom: string | null | undefined;
  mealType?: MealType | null;
  locationMode: OperationalCycleLocationMode;
  applicableUnitTypes?: UnitType[];
  unitIds?: string[];
  expectedMilestones?: ServeryMilestone[];
  /** When true, SERVICE without mealType is an error; otherwise a warning. */
  forPublish?: boolean;
};

export type PublishedCycleOverlapCandidate = {
  id: string;
  label: string;
  startLocal: string;
  endLocal: string;
  overnight: boolean;
  applicableDaysOfWeek: number[];
  locationMode: OperationalCycleLocationMode;
  applicableUnitTypes: UnitType[];
  unitIds: string[];
};

function issue(
  code: string,
  message: string,
  severity: "error" | "warning",
): CycleValidationIssue {
  return { code, message, severity };
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
 * Detect overlapping published cycles for the same applicable-day intersection and
 * location-scope intersection. Phase 9A forbids overlap among same-day non-overnight windows.
 */
export function findOverlappingPublishedCycles(
  candidate: PublishedCycleOverlapCandidate,
  others: readonly PublishedCycleOverlapCandidate[],
  facilityTimezone?: string | null,
  operationalDateKey = "2099-06-15",
): PublishedCycleOverlapCandidate[] {
  if (candidate.overnight || isStructurallyOvernight(candidate.startLocal, candidate.endLocal, false)) {
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
    if (other.overnight || isStructurallyOvernight(other.startLocal, other.endLocal, false)) {
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

/**
 * Validate a cycle draft or publish payload.
 * Does not invent a "Blocked" status — callers use errors/warnings only.
 */
export function validateCycle(input: ValidateCycleInput): CycleValidationResult {
  const errors: CycleValidationIssue[] = [];
  const warnings: CycleValidationIssue[] = [];
  const forPublish = input.forPublish === true;

  if (!input.label?.trim()) {
    errors.push(issue("label_required", "Cycle label is required.", "error"));
  }

  const start = parseLocalTime(input.startLocal);
  const end = parseLocalTime(input.endLocal);
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
      const msg = "SERVICE cycles should reference a meal type (targets remain on UnitMealTime).";
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

  if (input.locationMode === "EXPLICIT_UNITS") {
    if (!input.unitIds || input.unitIds.length === 0) {
      errors.push(
        issue("explicit_units_required", "Explicit unit location mode requires at least one unit.", "error"),
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

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateCycleForPublish(
  input: ValidateCycleInput,
  publishedPeers: readonly PublishedCycleOverlapCandidate[],
  facilityTimezone?: string | null,
): CycleValidationResult {
  const base = validateCycle({ ...input, forPublish: true });
  const errors = [...base.errors];
  const warnings = [...base.warnings];

  if (base.valid) {
    const candidate: PublishedCycleOverlapCandidate = {
      id: "__publishing__",
      label: input.label,
      startLocal: input.startLocal,
      endLocal: input.endLocal,
      overnight: input.overnight ?? false,
      applicableDaysOfWeek: input.applicableDaysOfWeek,
      locationMode: input.locationMode,
      applicableUnitTypes: input.applicableUnitTypes ?? [],
      unitIds: input.unitIds ?? [],
    };
    const overlaps = findOverlappingPublishedCycles(candidate, publishedPeers, facilityTimezone);
    for (const overlap of overlaps) {
      errors.push(
        issue(
          "overlap_published",
          `Overlaps published cycle "${overlap.label}" on a shared day and location scope.`,
          "error",
        ),
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
