import type { MealType, UnitType } from "@prisma/client";

import {
  effectiveMealType,
  projectCycleHierarchy,
} from "./cycle-hierarchy";
import { effectiveOperationalTypeKeys } from "./cycle-applicability";
import {
  buildCyclesByStableKey,
  effectiveCycleSpaceIds,
} from "./effective-cycle-spaces";
import {
  isApplicableWeekday,
  isStructurallyOvernight,
  resolveCycleWindowInstants,
} from "./cycle-windows";
import type {
  CycleUnitScope,
  OperationalCycleContext,
  OperationalCycleDefinition,
  ResolvedCycleOccurrence,
  UnitMealTarget,
} from "./types";

function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

function compareCycleOrder(a: ResolvedCycleOccurrence, b: ResolvedCycleOccurrence): number {
  return (
    a.displaySequence - b.displaySequence ||
    a.stableKey.localeCompare(b.stableKey) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Pure umbrellas provide parent context but should not win "primary" over
 * actionable child phases when both are concurrently active.
 * Any PERIOD with children and no own milestones is an umbrella, regardless
 * of locationMode — deepest actionable child is the useful primary context.
 */
function isPureUmbrella(occ: ResolvedCycleOccurrence): boolean {
  if (!occ.hasChildren) return false;
  if (occ.expectedMilestones.length > 0) return false;
  return true;
}

function comparePrimaryPreference(
  a: ResolvedCycleOccurrence,
  b: ResolvedCycleOccurrence,
): number {
  const aUmbrella = isPureUmbrella(a);
  const bUmbrella = isPureUmbrella(b);
  if (aUmbrella !== bUmbrella) return aUmbrella ? 1 : -1;
  // Prefer deeper (more specific) nodes among actionable peers.
  if (a.depth !== b.depth) return b.depth - a.depth;
  return compareCycleOrder(a, b);
}

export function cycleAppliesToUnit(
  cycle: Pick<
    OperationalCycleDefinition,
    | "locationMode"
    | "applicableUnitTypes"
    | "applicableOperationalTypeKeys"
    | "unitIds"
    | "spaceIds"
    | "roomTypeKey"
    | "locationInheritFromParent"
    | "parentStableKey"
    | "nodeKind"
    | "stableKey"
    | "keyTimeGroups"
  >,
  unit: CycleUnitScope,
  allCyclesByStableKey?: ReadonlyMap<string, OperationalCycleDefinition>,
): boolean {
  // Prefer explicit effective Room membership when the published set is available.
  if (allCyclesByStableKey) {
    const effectiveSpaces = effectiveCycleSpaceIds(cycle, allCyclesByStableKey);
    if (effectiveSpaces.length > 0) {
      const unitSpaces = unit.spaceIds ?? [];
      if (unitSpaces.some((id) => effectiveSpaces.includes(id))) return true;
      if (cycle.unitIds.includes(unit.id)) return true;
      return false;
    }
    if (cycle.locationInheritFromParent || cycle.locationMode === "EXPLICIT_UNITS") {
      // Explicit/inherited with empty rooms → not applicable to this unit.
      if (cycle.locationMode === "EXPLICIT_UNITS" || cycle.locationInheritFromParent) {
        return cycle.unitIds.includes(unit.id);
      }
    }
  }

  switch (cycle.locationMode) {
    case "ALL_DEPARTMENT_UNITS":
      return true;
    case "UNIT_TYPES":
      return cycle.applicableUnitTypes.includes(unit.unitType);
    case "EXPLICIT_UNITS": {
      if (cycle.unitIds.includes(unit.id)) return true;
      const unitSpaces = unit.spaceIds ?? [];
      if (unitSpaces.length > 0 && cycle.spaceIds.some((id) => unitSpaces.includes(id))) {
        return true;
      }
      return false;
    }
    case "ROOM_TYPE":
      if (!cycle.roomTypeKey) return false;
      if (!unit.childRoomTypeKeys) return true;
      return unit.childRoomTypeKeys.includes(cycle.roomTypeKey);
    case "OPERATIONAL_TYPES": {
      const otKeys = allCyclesByStableKey
        ? effectiveOperationalTypeKeys(cycle, allCyclesByStableKey)
        : cycle.applicableOperationalTypeKeys ?? [];
      if (otKeys.length === 0) return false;
      const childKeys = unit.childOperationalTypeKeys ?? [];
      return childKeys.some((key) => otKeys.includes(key));
    }
    default:
      return false;
  }
}

export type CycleSpaceApplicabilityContext = {
  /** Current Operational Type key for this room. Unassigned rooms do not match OT cycles. */
  operationalTypeKey?: string | null;
};

/** Room-level applicability using the canonical PERIOD/KEY_TIME effective Room set. */
export function cycleAppliesToSpace(
  cycle: OperationalCycleDefinition,
  spaceId: string,
  allCyclesByStableKey: ReadonlyMap<string, OperationalCycleDefinition>,
  context?: CycleSpaceApplicabilityContext,
): boolean {
  const spaces = effectiveCycleSpaceIds(cycle, allCyclesByStableKey);
  if (spaces.length > 0) return spaces.includes(spaceId);
  if (cycle.nodeKind === "KEY_TIME") return false;
  const otKeys = effectiveOperationalTypeKeys(cycle, allCyclesByStableKey);
  if (otKeys.length > 0) {
    const key = context?.operationalTypeKey?.trim() ?? "";
    return Boolean(key && otKeys.includes(key));
  }
  if (cycle.locationMode === "ALL_DEPARTMENT_UNITS") return true;
  if (cycle.locationInheritFromParent) {
    const parent = cycle.parentStableKey
      ? allCyclesByStableKey.get(cycle.parentStableKey)
      : undefined;
    if (parent?.locationMode === "ALL_DEPARTMENT_UNITS") return true;
  }
  return false;
}

function toOccurrence(
  cycle: OperationalCycleDefinition,
  window: { startsAt: Date; endsAt: Date },
  hierarchy: ReturnType<typeof projectCycleHierarchy>,
  published: readonly OperationalCycleDefinition[],
): ResolvedCycleOccurrence {
  const node = hierarchy.byStableKey.get(cycle.stableKey);
  const depth = node?.depth ?? 0;
  const displayPath = node?.displayPath ?? cycle.label;
  const ancestorLabels = node?.path.slice(0, -1) ?? [];
  const mealType = effectiveMealType({
    mealType: cycle.mealType,
    stableKey: cycle.stableKey,
    rows: published,
  });

  return {
    id: cycle.id,
    stableKey: cycle.stableKey,
    version: cycle.version,
    label: cycle.label,
    cycleType: cycle.cycleType,
    displaySequence: cycle.displaySequence,
    startLocal: cycle.startLocal ?? "",
    endLocal: cycle.endLocal ?? "",
    overnight:
      cycle.overnight ||
      (cycle.startLocal && cycle.endLocal
        ? isStructurallyOvernight(cycle.startLocal, cycle.endLocal, false)
        : false),
    mealType,
    expectedMilestones: cycle.expectedMilestones,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    parentStableKey: node?.parentStableKey ?? cycle.parentStableKey ?? null,
    depth,
    displayPath,
    ancestorLabels,
    hasChildren: node?.hasChildren ?? false,
  };
}

function mealTargetFor(
  mealType: MealType | null | undefined,
  mealTargets: readonly UnitMealTarget[] | undefined,
): string | null {
  if (!mealType || !mealTargets?.length) return null;
  return mealTargets.find((t) => t.mealType === mealType)?.scheduledTime ?? null;
}

/** Natural-language label for Run surfaces (path when nested). */
export function formatCycleHierarchyLabel(
  occ: Pick<ResolvedCycleOccurrence, "label" | "displayPath" | "depth">,
): string {
  if (occ.depth > 0 && occ.displayPath.includes(" → ")) return occ.displayPath;
  return occ.label;
}

/**
 * Summarize concurrent active phases for supervisor / Operations Center headers.
 * Does not invent a single global current cycle when multiple phases overlap.
 */
export function summarizeActiveCycleContext(
  active: readonly ResolvedCycleOccurrence[],
): { summary: string; phaseLabels: string[] } {
  if (active.length === 0) return { summary: "", phaseLabels: [] };

  const actionable = active.filter(
    (occ) => !(occ.hasChildren && occ.expectedMilestones.length === 0),
  );
  const focus = actionable.length > 0 ? actionable : [...active];
  const phaseLabels = focus.map((occ) => occ.label);

  const rootLabels = [
    ...new Set(
      focus.map((occ) => occ.ancestorLabels[0] ?? occ.label),
    ),
  ];

  if (focus.length === 1) {
    return { summary: formatCycleHierarchyLabel(focus[0]!), phaseLabels };
  }

  if (rootLabels.length === 1) {
    const root = rootLabels[0]!;
    const phases = focus.filter((occ) => occ.depth > 0 || !occ.hasChildren);
    if (phases.length > 1) {
      return {
        summary: `${root} · ${phases.length} active phases`,
        phaseLabels: phases.map((occ) => occ.label),
      };
    }
  }

  return {
    summary: focus.map((occ) => formatCycleHierarchyLabel(occ)).join(" · "),
    phaseLabels,
  };
}

/**
 * Authoritative pure Operational Cycle resolver (Phase 9A).
 * Testable without DB. Does not invent Breakfast defaults.
 *
 * Concurrent actives are preserved on `activeCycles`. `primary` is a selected
 * display/context node: prefers actionable children over pure umbrella parents,
 * then deeper nodes, then displaySequence.
 */
export function resolveOperationalCycle(input: {
  cycles: readonly OperationalCycleDefinition[];
  now: Date;
  facilityTimezone?: string | null;
  operationalDateKey: string;
  unit?: CycleUnitScope | null;
  /** When set, Room grain is authoritative — parents do not expand the set. */
  spaceId?: string | null;
  /** Current Operational Type for spaceId — required for OPERATIONAL_TYPES targeting. */
  operationalTypeKey?: string | null;
  /** When false, department has no cycle applicability (e.g. wrong department). */
  departmentApplicable?: boolean;
  /** UnitMealTime targets — never copied from cycle rows. */
  mealTargets?: readonly UnitMealTarget[];
}): OperationalCycleContext {
  if (input.departmentApplicable === false) {
    return { state: "NOT_APPLICABLE" };
  }

  const published = input.cycles.filter(
    (c) => c.status === "PUBLISHED" || c.status === "RETIRED",
  );
  if (published.length === 0) {
    return { state: "NOT_CONFIGURED", reason: "NO_PUBLISHED_CYCLES" };
  }

  // Hierarchy from the full effective published set (not location-filtered),
  // so child paths retain parent labels even when the parent is later filtered out.
  const hierarchy = projectCycleHierarchy(published);
  const defsByKey = buildCyclesByStableKey(published);

  let scoped = published.filter((c) =>
    isApplicableWeekday(c.applicableDaysOfWeek, input.operationalDateKey, input.facilityTimezone),
  );

  if (input.spaceId) {
    scoped = scoped.filter((c) =>
      cycleAppliesToSpace(c, input.spaceId!, defsByKey, {
        operationalTypeKey: input.operationalTypeKey,
      }),
    );
    if (scoped.length === 0) {
      return { state: "NOT_APPLICABLE" };
    }
  } else if (input.unit) {
    scoped = scoped.filter((c) => cycleAppliesToUnit(c, input.unit!, defsByKey));
    if (scoped.length === 0) {
      return { state: "NOT_APPLICABLE" };
    }
  }

  if (scoped.length === 0) {
    return { state: "NOT_CONFIGURED", reason: "NONE_APPLICABLE" };
  }

  const occurrences: ResolvedCycleOccurrence[] = [];
  for (const cycle of scoped) {
    if (cycle.nodeKind === "KEY_TIME") continue;
    if (!cycle.startLocal?.trim() || !cycle.endLocal?.trim()) continue;
    const window = resolveCycleWindowInstants({
      operationalDateKey: input.operationalDateKey,
      startLocal: cycle.startLocal,
      endLocal: cycle.endLocal,
      overnight: cycle.overnight,
      facilityTimezone: input.facilityTimezone,
    });
    if (!window) continue;
    occurrences.push(toOccurrence(cycle, window, hierarchy, published));
  }

  if (occurrences.length === 0) {
    return { state: "NOT_CONFIGURED", reason: "NONE_APPLICABLE" };
  }

  occurrences.sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() || compareCycleOrder(a, b),
  );

  const nowMs = input.now.getTime();
  const active = occurrences
    .filter((o) => nowMs >= o.startsAt.getTime() && nowMs < o.endsAt.getTime())
    .sort((a, b) => comparePrimaryPreference(a, b));

  const upcoming = occurrences
    .filter((o) => o.startsAt.getTime() > nowMs)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || compareCycleOrder(a, b));

  const passed = occurrences.filter((o) => o.endsAt.getTime() <= nowMs);
  const previous = passed.length > 0 ? passed[passed.length - 1]! : null;
  const next = upcoming[0] ?? null;

  if (active.length > 0) {
    const primary = active[0]!;
    return {
      state: "ACTIVE",
      primary,
      activeCycles: active,
      next,
      minutesUntilNext: next ? minutesBetween(input.now, next.startsAt) : null,
      mealTargetTime: mealTargetFor(primary.mealType, input.mealTargets),
    };
  }

  if (next && previous) {
    return {
      state: "BETWEEN",
      previous,
      next,
      minutesUntilNext: minutesBetween(input.now, next.startsAt),
      mealTargetTime: mealTargetFor(next.mealType, input.mealTargets),
    };
  }

  if (next) {
    return {
      state: "UPCOMING",
      next,
      minutesUntilNext: minutesBetween(input.now, next.startsAt),
      mealTargetTime: mealTargetFor(next.mealType, input.mealTargets),
    };
  }

  if (previous) {
    return {
      state: "DAY_COMPLETE",
      last: previous,
      mealTargetTime: mealTargetFor(previous.mealType, input.mealTargets),
    };
  }

  return { state: "NOT_CONFIGURED", reason: "NONE_APPLICABLE" };
}

/**
 * Reusable active-node projection on top of effective published versions.
 * Location filter uses each node's own scope + window — parents do not activate children.
 */
export function resolveActiveCycleNodes(input: {
  cycles: readonly OperationalCycleDefinition[];
  now: Date;
  facilityTimezone?: string | null;
  operationalDateKey: string;
  unit?: CycleUnitScope | null;
  spaceId?: string | null;
  mealTargets?: readonly UnitMealTarget[];
}): {
  active: ResolvedCycleOccurrence[];
  primary: ResolvedCycleOccurrence | null;
  summary: string;
  phaseLabels: string[];
} {
  const ctx = resolveOperationalCycle(input);
  if (ctx.state !== "ACTIVE") {
    return { active: [], primary: null, summary: "", phaseLabels: [] };
  }
  const { summary, phaseLabels } = summarizeActiveCycleContext(ctx.activeCycles);
  return {
    active: ctx.activeCycles,
    primary: ctx.primary,
    summary,
    phaseLabels,
  };
}

/** Neutral factual copy for runtime cards. Never invents a meal or blames another department. */
export function describeOperationalCycleContext(context: OperationalCycleContext): string {
  switch (context.state) {
    case "NOT_APPLICABLE":
      return "Operational cycles do not apply to this location.";
    case "NOT_CONFIGURED":
      return context.reason === "NO_PUBLISHED_CYCLES"
        ? "No published operational cycles are configured for this department."
        : "No operational cycles apply for this date.";
    case "ACTIVE": {
      const actionable = context.activeCycles.filter(
        (occ) => !(occ.hasChildren && occ.expectedMilestones.length === 0),
      );
      const focus = actionable.length > 0 ? actionable : context.activeCycles;
      if (focus.length === 1) {
        return `${formatCycleHierarchyLabel(focus[0]!)} is active.`;
      }
      const { summary, phaseLabels } = summarizeActiveCycleContext(context.activeCycles);
      if (summary.includes("active phases")) {
        return `${summary}: ${phaseLabels.join(", ")}.`;
      }
      return `${summary} are active.`;
    }
    case "UPCOMING":
      return `Next: ${formatCycleHierarchyLabel(context.next)}.`;
    case "BETWEEN":
      return `${formatCycleHierarchyLabel(context.previous)} has ended. Next: ${formatCycleHierarchyLabel(context.next)}.`;
    case "DAY_COMPLETE":
      return `All configured cycles for today have passed. Last: ${formatCycleHierarchyLabel(context.last)}.`;
  }
}

/** Unit types that typically participate in Dietary meal-service cycle runtime. */
export const DIETARY_CYCLE_UNIT_TYPES: ReadonlySet<UnitType> = new Set([
  "SERVERY",
  "KITCHEN",
  "RETAIL",
]);
