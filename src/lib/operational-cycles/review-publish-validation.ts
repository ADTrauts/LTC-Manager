/**
 * Canonical Review & Publish validation for Operational Cycle drafts.
 * Same issue model drives Review UI and publish enforcement.
 */

import { toServiceDateKey } from "@/lib/operational-time";

import { formatCycleClock } from "./cycle-display";
import { projectCycleHierarchy } from "./cycle-hierarchy";
import { parseLocalTime } from "./cycle-windows";
import type { OperationalCycleDefinition } from "./types";
import { validateCycle } from "./validate-cycle";

export type ReviewPublishFixFocus = "rooms" | "key_times" | "legacy" | "general";

export type ReviewPublishFixTarget = {
  /** Draft row id — opens the correct editor (never label-based). */
  cycleId: string;
  stableKey: string;
  focus: ReviewPublishFixFocus;
};

export type ReviewPublishIssue = {
  severity: "error" | "warning";
  code: string;
  stableKey: string;
  cycleId: string;
  displayLabel: string;
  displayPath: string;
  title: string;
  message: string;
  consequence?: string;
  fixLabel: string;
  fixTarget: ReviewPublishFixTarget;
};

export type ReviewPublishValidationResult = {
  valid: boolean;
  blockers: ReviewPublishIssue[];
  warnings: ReviewPublishIssue[];
};

function minutesOf(local: string | null | undefined): number | null {
  const parsed = parseLocalTime(local ?? "");
  if (!parsed) return null;
  return parsed.hours * 60 + parsed.minutes;
}

function hasExplicitLocationSelection(
  row: Pick<
    OperationalCycleDefinition,
    | "locationInheritFromParent"
    | "locationMode"
    | "spaceIds"
    | "unitIds"
    | "roomTypeKey"
    | "applicableOperationalTypeKeys"
  >,
): boolean {
  if (row.locationInheritFromParent) return false;
  if (row.locationMode === "ROOM_TYPE" && Boolean(row.roomTypeKey?.trim())) return true;
  if (row.locationMode === "ALL_DEPARTMENT_UNITS") return true;
  if (row.locationMode === "UNIT_TYPES") return true;
  if (row.locationMode === "OPERATIONAL_TYPES") {
    return (row.applicableOperationalTypeKeys?.length ?? 0) > 0;
  }
  return (row.spaceIds?.length ?? 0) + (row.unitIds?.length ?? 0) > 0;
}

/**
 * Merge published/current rows with drafts for parent-location resolution.
 * Drafts win on the same stableKey.
 */
export function buildLocationResolutionMap(
  drafts: readonly OperationalCycleDefinition[],
  locationContext: readonly OperationalCycleDefinition[] = [],
): Map<string, OperationalCycleDefinition> {
  const byKey = new Map<string, OperationalCycleDefinition>();
  for (const row of locationContext) {
    byKey.set(row.stableKey, row);
  }
  for (const row of drafts) {
    byKey.set(row.stableKey, row);
  }
  return byKey;
}

/** Walk up inheriting PERIOD parents to the first explicit-location ancestor (or root). */
function locationRootCause(
  row: OperationalCycleDefinition,
  byKey: Map<string, OperationalCycleDefinition>,
): { root: OperationalCycleDefinition; parentMissing: boolean } {
  let cursor: OperationalCycleDefinition = row;
  const seen = new Set<string>();
  while (cursor.locationInheritFromParent && cursor.parentStableKey) {
    if (seen.has(cursor.stableKey)) break;
    seen.add(cursor.stableKey);
    const parent = byKey.get(cursor.parentStableKey);
    if (!parent) {
      return { root: cursor, parentMissing: true };
    }
    if (parent.nodeKind === "KEY_TIME") break;
    cursor = parent;
  }
  return { root: cursor, parentMissing: false };
}

function inheritingDescendants(
  rootStableKey: string,
  drafts: readonly OperationalCycleDefinition[],
): OperationalCycleDefinition[] {
  const byParent = new Map<string | null, OperationalCycleDefinition[]>();
  for (const draft of drafts) {
    if (draft.nodeKind !== "PERIOD") continue;
    const parent = draft.parentStableKey;
    const list = byParent.get(parent) ?? [];
    list.push(draft);
    byParent.set(parent, list);
  }
  const out: OperationalCycleDefinition[] = [];
  function walk(parentKey: string) {
    for (const child of byParent.get(parentKey) ?? []) {
      if (!child.locationInheritFromParent) continue;
      out.push(child);
      walk(child.stableKey);
    }
  }
  walk(rootStableKey);
  return out;
}

function issueBase(
  row: OperationalCycleDefinition,
  displayPath: string,
  partial: Omit<
    ReviewPublishIssue,
    "stableKey" | "cycleId" | "displayLabel" | "displayPath" | "fixTarget"
  > & { focus?: ReviewPublishFixFocus; fixCycleId?: string },
): ReviewPublishIssue {
  const focus = partial.focus ?? "general";
  return {
    severity: partial.severity,
    code: partial.code,
    stableKey: row.stableKey,
    cycleId: row.id,
    displayLabel: row.label,
    displayPath,
    title: partial.title,
    message: partial.message,
    consequence: partial.consequence,
    fixLabel: partial.fixLabel,
    fixTarget: {
      cycleId: partial.fixCycleId ?? row.id,
      stableKey: row.stableKey,
      focus,
    },
  };
}

function mapLocationBlocker(input: {
  row: OperationalCycleDefinition;
  displayPath: string;
  inheritors: OperationalCycleDefinition[];
}): ReviewPublishIssue {
  const { row, displayPath, inheritors } = input;
  const isTop = !row.parentStableKey;
  const inheritorNames = inheritors.map((d) => d.label);
  const consequence =
    inheritorNames.length === 0
      ? isTop
        ? "Phases configured to use these locations will use the Rooms selected here."
        : undefined
      : inheritorNames.length === 1
        ? `${inheritorNames[0]} inherits ${row.label}'s locations, so it will also have no effective locations.`
        : `${inheritorNames.slice(0, -1).join(", ")} and ${inheritorNames[inheritorNames.length - 1]} inherit ${row.label}'s locations, so they will also have no effective locations.`;

  if (isTop) {
    return issueBase(row, displayPath, {
      severity: "error",
      code: "period_rooms_required",
      title: `${row.label} needs locations`,
      message: `Choose at least one Room for ${row.label}.`,
      consequence,
      fixLabel: "Choose Rooms",
      focus: "rooms",
    });
  }

  return issueBase(row, displayPath, {
    severity: "error",
    code: "phase_rooms_required",
    title: `${row.label} needs locations`,
    message: `${row.label} is configured to use different Rooms but none are selected.`,
    consequence,
    fixLabel: "Choose Rooms",
    focus: "rooms",
  });
}

function mapKeyTimeIssue(
  row: OperationalCycleDefinition,
  displayPath: string,
  code: string,
  rawMessage: string,
  locationNames: Readonly<Record<string, string>>,
): ReviewPublishIssue | null {
  if (code === "key_time_groups_required") {
    return issueBase(row, displayPath, {
      severity: "error",
      code,
      title: `${row.label} needs a due time`,
      message: "Add at least one due-time group and select the Rooms it applies to.",
      fixLabel: "Set key time",
      focus: "key_times",
    });
  }
  if (code === "key_time_group_rooms_required") {
    const dueMatch = /(\d{1,2}:\d{2})/.exec(rawMessage);
    const due = dueMatch?.[1] ?? null;
    const dueLabel = due ? formatCycleClock(due) : null;
    return issueBase(row, displayPath, {
      severity: "error",
      code,
      title: dueLabel ? `${row.label} · ${dueLabel} needs Rooms` : `${row.label} needs Rooms`,
      message: dueLabel
        ? `Select at least one Room for the ${dueLabel} due-time group, or remove this empty group.`
        : "Select at least one Room or remove this empty due-time group.",
      fixLabel: "Edit key time",
      focus: "key_times",
    });
  }
  if (code === "key_time_room_duplicate") {
    const seen = new Map<string, string>();
    let duplicateId: string | null = null;
    for (const group of row.keyTimeGroups) {
      for (const spaceId of group.spaceIds) {
        if (seen.has(spaceId)) {
          duplicateId = spaceId;
          break;
        }
        seen.set(spaceId, group.dueLocal);
      }
      if (duplicateId) break;
    }
    const roomName = duplicateId ? locationNames[duplicateId] ?? "A Room" : "A Room";
    return issueBase(row, displayPath, {
      severity: "error",
      code,
      title: `${roomName} has more than one due time`,
      message: `A Room can only have one due time within ${row.label}.`,
      fixLabel: `Fix ${row.label}`,
      focus: "key_times",
    });
  }
  if (
    code === "key_time_due_invalid" ||
    code === "key_time_parent_required" ||
    code === "key_time_no_duration"
  ) {
    return issueBase(row, displayPath, {
      severity: "error",
      code,
      title: `${row.label} needs attention`,
      message: rawMessage
        .replace(/\bKey Time nodes\b/g, "Key Times")
        .replace(/\bparent phase\b/g, "parent Operational Cycle"),
      fixLabel: "Edit key time",
      focus: "key_times",
    });
  }
  return null;
}

function phaseOutsideParentWindow(
  child: OperationalCycleDefinition,
  parent: OperationalCycleDefinition,
): string | null {
  if (child.nodeKind !== "PERIOD" || parent.nodeKind !== "PERIOD") return null;
  if (child.overnight || parent.overnight) return null;
  const cStart = minutesOf(child.startLocal);
  const cEnd = minutesOf(child.endLocal);
  const pStart = minutesOf(parent.startLocal);
  const pEnd = minutesOf(parent.endLocal);
  if (cStart == null || cEnd == null || pStart == null || pEnd == null) return null;
  if (cStart >= pStart && cEnd <= pEnd) return null;
  const endLabel = parent.endLocal ? formatCycleClock(parent.endLocal) : "end";
  const startLabel = parent.startLocal ? formatCycleClock(parent.startLocal) : "start";
  if (cEnd > pEnd) {
    return `${child.label} extends beyond ${parent.label}'s ${endLabel} end time.`;
  }
  if (cStart < pStart) {
    return `${child.label} starts before ${parent.label}'s ${startLabel} start time.`;
  }
  return `${child.label} sits partly outside ${parent.label}'s time window.`;
}

/**
 * Validate an entire draft set for Review & Publish.
 * Consolidates inherited location failures onto the root-cause parent.
 *
 * `locationContext` should include currently published cycles so a draft Phase
 * that inherits from a published parent can resolve that parent's Rooms.
 */
export function validateDraftsForReviewPublish(input: {
  drafts: readonly OperationalCycleDefinition[];
  /** Published/current (and other) rows for parent Room resolution. */
  locationContext?: readonly OperationalCycleDefinition[];
  locationNames?: Readonly<Record<string, string>>;
  /** Authorized department Room ids; missing/foreign Rooms become blockers. */
  authorizedSpaceIds?: ReadonlySet<string>;
}): ReviewPublishValidationResult {
  const drafts = input.drafts;
  const locationNames = input.locationNames ?? {};
  const authorized = input.authorizedSpaceIds;
  const draftByKey = new Map(drafts.map((d) => [d.stableKey, d]));
  const byKey = buildLocationResolutionMap(drafts, input.locationContext);
  const hierarchy = projectCycleHierarchy(
    drafts.map((d) => ({
      stableKey: d.stableKey,
      label: d.label,
      parentStableKey: d.parentStableKey,
      displaySequence: d.displaySequence,
      nodeKind: d.nodeKind,
      id: d.id,
    })),
  );

  const blockers: ReviewPublishIssue[] = [];
  const warnings: ReviewPublishIssue[] = [];

  type InheritProblem =
    | { kind: "missing_parent"; row: OperationalCycleDefinition }
    | {
        kind: "empty_published_parent";
        row: OperationalCycleDefinition;
        parent: OperationalCycleDefinition;
      };

  const locationFailKeys = new Set<string>();
  const inheritProblems: InheritProblem[] = [];

  for (const row of drafts) {
    if (row.nodeKind !== "PERIOD") continue;
    if (row.locationInheritFromParent && row.parentStableKey) {
      const { root, parentMissing } = locationRootCause(row, byKey);
      if (parentMissing) {
        inheritProblems.push({ kind: "missing_parent", row });
        continue;
      }
      if (!hasExplicitLocationSelection(root)) {
        if (draftByKey.has(root.stableKey) && root.stableKey !== row.stableKey) {
          locationFailKeys.add(root.stableKey);
        } else if (root.stableKey === row.stableKey) {
          inheritProblems.push({ kind: "missing_parent", row });
        } else {
          inheritProblems.push({ kind: "empty_published_parent", row, parent: root });
        }
      }
      continue;
    }
    if (
      (row.locationMode === "EXPLICIT_UNITS" || row.locationMode === "OPERATIONAL_TYPES") &&
      !hasExplicitLocationSelection(row)
    ) {
      locationFailKeys.add(row.stableKey);
    }
  }

  for (const stableKey of locationFailKeys) {
    const row = draftByKey.get(stableKey);
    if (!row) continue;
    const node = hierarchy.byStableKey.get(stableKey);
    const inheritors = inheritingDescendants(stableKey, drafts);
    blockers.push(
      mapLocationBlocker({
        row,
        displayPath: node?.displayPath ?? row.label,
        inheritors,
      }),
    );
  }

  for (const problem of inheritProblems) {
    const row = problem.row;
    const displayPath = hierarchy.byStableKey.get(row.stableKey)?.displayPath ?? row.label;
    if (problem.kind === "empty_published_parent") {
      const parent = problem.parent;
      blockers.push(
        issueBase(row, displayPath, {
          severity: "error",
          code: "parent_rooms_required",
          title: `${parent.label} needs locations`,
          message: `${row.label} uses ${parent.label}'s locations, but ${parent.label} has no Rooms selected.`,
          fixLabel: `Fix ${parent.label}`,
          focus: "rooms",
          fixCycleId: draftByKey.get(parent.stableKey)?.id ?? row.id,
        }),
      );
      continue;
    }
    const parentLabel =
      (row.parentStableKey && byKey.get(row.parentStableKey)?.label) || "its parent";
    blockers.push(
      issueBase(row, displayPath, {
        severity: "error",
        code: "parent_locations_unavailable",
        title: `${row.label} needs a parent with locations`,
        message: `${row.label} is set to use parent locations, but ${parentLabel} is missing from this configuration.`,
        fixLabel: `Edit ${row.label}`,
        focus: "rooms",
      }),
    );
  }

  for (const row of drafts) {
    const displayPath = hierarchy.byStableKey.get(row.stableKey)?.displayPath ?? row.label;
    const result = validateCycle({
      label: row.label,
      cycleType: row.cycleType,
      nodeKind: row.nodeKind,
      parentStableKey: row.parentStableKey,
      startLocal: row.startLocal,
      endLocal: row.endLocal,
      overnight: row.overnight,
      applicableDaysOfWeek: row.applicableDaysOfWeek,
      effectiveFrom: toServiceDateKey(row.effectiveFrom),
      mealType: row.mealType,
      locationMode: row.locationMode,
      locationInheritFromParent: row.locationInheritFromParent,
      applicableUnitTypes: row.applicableUnitTypes,
      unitIds: row.unitIds,
      spaceIds: row.spaceIds,
      keyTimeGroups: row.keyTimeGroups,
      roomTypeKey: row.roomTypeKey,
      expectedMilestones: row.expectedMilestones,
      forPublish: true,
    });

    for (const err of result.errors) {
      if (err.code === "explicit_locations_required") continue;

      if (row.nodeKind === "KEY_TIME") {
        const mapped = mapKeyTimeIssue(row, displayPath, err.code, err.message, locationNames);
        if (mapped) {
          blockers.push(mapped);
          continue;
        }
      }

      if (err.code === "inherit_top_level") {
        blockers.push(
          issueBase(row, displayPath, {
            severity: "error",
            code: err.code,
            title: `${row.label} needs locations`,
            message: "Top-level Operational Cycles cannot use parent locations.",
            fixLabel: "Choose Rooms",
            focus: "rooms",
          }),
        );
        continue;
      }

      blockers.push(
        issueBase(row, displayPath, {
          severity: "error",
          code: err.code,
          title: `${row.label} needs attention`,
          message: err.message,
          fixLabel: `Fix ${row.label}`,
          focus: "general",
        }),
      );
    }

    for (const warn of result.warnings) {
      if (warn.code === "explicit_locations_empty") continue;
      warnings.push(
        issueBase(row, displayPath, {
          severity: "warning",
          code: warn.code,
          title: `${row.label}`,
          message: warn.message
            .replace(/\bSERVICE cycles\b/g, "Service cycles")
            .replace(/\bmeal type\b/g, "meal"),
          fixLabel: `Review ${row.label}`,
          focus: "general",
        }),
      );
    }

    if (
      authorized &&
      row.nodeKind === "PERIOD" &&
      !row.locationInheritFromParent &&
      row.locationMode === "EXPLICIT_UNITS"
    ) {
      const bad = row.spaceIds.filter((id) => !authorized.has(id));
      if (bad.length > 0) {
        const names = bad.map((id) => locationNames[id] ?? "Unknown Room");
        blockers.push(
          issueBase(row, displayPath, {
            severity: "error",
            code: "room_out_of_scope",
            title:
              bad.length === 1
                ? `${names[0]} is not available`
                : `${bad.length} Rooms are not available`,
            message:
              bad.length === 1
                ? `${names[0]} is no longer in this department’s authorized Rooms.`
                : `${names.join(", ")} are no longer in this department’s authorized Rooms.`,
            fixLabel: "Choose Rooms",
            focus: "rooms",
          }),
        );
      }
    }

    if (authorized && row.nodeKind === "KEY_TIME") {
      for (const group of row.keyTimeGroups) {
        const bad = group.spaceIds.filter((id) => !authorized.has(id));
        if (bad.length === 0) continue;
        const names = bad.map((id) => locationNames[id] ?? "Unknown Room");
        blockers.push(
          issueBase(row, displayPath, {
            severity: "error",
            code: "key_time_room_out_of_scope",
            title:
              bad.length === 1
                ? `${names[0]} is not available`
                : `${bad.length} Rooms are not available`,
            message: `${names.join(", ")} cannot be used in ${row.label}.`,
            fixLabel: "Edit key time",
            focus: "key_times",
          }),
        );
      }
    }
  }

  for (const row of drafts) {
    if (row.nodeKind !== "PERIOD" || !row.parentStableKey) continue;
    const parent = byKey.get(row.parentStableKey);
    if (!parent) continue;
    const msg = phaseOutsideParentWindow(row, parent);
    if (!msg) continue;
    const displayPath = hierarchy.byStableKey.get(row.stableKey)?.displayPath ?? row.label;
    warnings.push(
      issueBase(row, displayPath, {
        severity: "warning",
        code: "phase_outside_parent_window",
        title: `${row.label} time window`,
        message: msg,
        fixLabel: `Review ${row.label}`,
        focus: "general",
      }),
    );
  }

  for (const root of hierarchy.roots) {
    const branchKeys = [root.stableKey, ...collectDescendantKeys(root)];
    const branchRows = branchKeys
      .map((k) => byKey.get(k))
      .filter(Boolean) as OperationalCycleDefinition[];
    const hasKeyTime = branchRows.some((r) => r.nodeKind === "KEY_TIME");
    const legacyRows = drafts.filter(
      (r) =>
        branchKeys.includes(r.stableKey) &&
        r.nodeKind === "PERIOD" &&
        (r.expectedMilestones.includes("SERVICE_STARTED") ||
          r.milestoneTimes.some((t) => t.milestone === "SERVICE_STARTED")),
    );
    if (!hasKeyTime || legacyRows.length === 0) continue;
    for (const legacy of legacyRows) {
      const displayPath = hierarchy.byStableKey.get(legacy.stableKey)?.displayPath ?? legacy.label;
      warnings.push(
        issueBase(legacy, displayPath, {
          severity: "warning",
          code: "legacy_meal_timing_coexistence",
          title: "Legacy timing configuration remains",
          message: `${legacy.label} still contains legacy meal-service timing in addition to new Key Times. The new Key Time model is the preferred configuration.`,
          fixLabel: "Review legacy settings",
          focus: "legacy",
        }),
      );
    }
  }

  const seenBlocker = new Set<string>();
  const uniqueBlockers = blockers.filter((b) => {
    const key = `${b.code}:${b.stableKey}:${b.title}`;
    if (seenBlocker.has(key)) return false;
    seenBlocker.add(key);
    return true;
  });

  const seenWarn = new Set<string>();
  const uniqueWarnings = warnings.filter((w) => {
    const key = `${w.code}:${w.stableKey}`;
    if (seenWarn.has(key)) return false;
    seenWarn.add(key);
    return true;
  });

  return {
    valid: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
  };
}

function collectDescendantKeys(
  node: { stableKey: string; children: { stableKey: string; children: unknown[] }[] },
): string[] {
  const keys: string[] = [];
  for (const child of node.children as Array<{
    stableKey: string;
    children: Array<{ stableKey: string; children: unknown[] }>;
  }>) {
    keys.push(child.stableKey, ...collectDescendantKeys(child));
  }
  return keys;
}

/** True when publication must be refused. */
export function reviewPublishHasBlockers(result: ReviewPublishValidationResult): boolean {
  return result.blockers.length > 0;
}

export function formatReviewPublishBlockerSummary(result: ReviewPublishValidationResult): string {
  const n = result.blockers.length;
  if (n === 0) return "Ready to publish";
  if (n === 1) return "1 item needs attention";
  return `${n} items need attention`;
}
