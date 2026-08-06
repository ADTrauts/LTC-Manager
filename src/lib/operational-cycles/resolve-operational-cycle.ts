import type { MealType, UnitType } from "@prisma/client";

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

export function cycleAppliesToUnit(
  cycle: Pick<
    OperationalCycleDefinition,
    "locationMode" | "applicableUnitTypes" | "unitIds"
  >,
  unit: CycleUnitScope,
): boolean {
  switch (cycle.locationMode) {
    case "ALL_DEPARTMENT_UNITS":
      return true;
    case "UNIT_TYPES":
      return cycle.applicableUnitTypes.includes(unit.unitType);
    case "EXPLICIT_UNITS":
      return cycle.unitIds.includes(unit.id);
    default:
      return false;
  }
}

function toOccurrence(
  cycle: OperationalCycleDefinition,
  window: { startsAt: Date; endsAt: Date },
): ResolvedCycleOccurrence {
  return {
    id: cycle.id,
    stableKey: cycle.stableKey,
    version: cycle.version,
    label: cycle.label,
    cycleType: cycle.cycleType,
    displaySequence: cycle.displaySequence,
    startLocal: cycle.startLocal,
    endLocal: cycle.endLocal,
    overnight: cycle.overnight || isStructurallyOvernight(cycle.startLocal, cycle.endLocal, false),
    mealType: cycle.mealType,
    expectedMilestones: cycle.expectedMilestones,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
  };
}

function mealTargetFor(
  mealType: MealType | null | undefined,
  mealTargets: readonly UnitMealTarget[] | undefined,
): string | null {
  if (!mealType || !mealTargets?.length) return null;
  return mealTargets.find((t) => t.mealType === mealType)?.scheduledTime ?? null;
}

/**
 * Authoritative pure Operational Cycle resolver (Phase 9A).
 * Testable without DB. Does not invent Breakfast defaults.
 * Deterministic primary among concurrent actives: lowest displaySequence, then stableKey, then id.
 */
export function resolveOperationalCycle(input: {
  cycles: readonly OperationalCycleDefinition[];
  now: Date;
  facilityTimezone?: string | null;
  operationalDateKey: string;
  unit?: CycleUnitScope | null;
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

  let scoped = published.filter((c) =>
    isApplicableWeekday(c.applicableDaysOfWeek, input.operationalDateKey, input.facilityTimezone),
  );

  if (input.unit) {
    scoped = scoped.filter((c) => cycleAppliesToUnit(c, input.unit!));
    if (scoped.length === 0) {
      return { state: "NOT_APPLICABLE" };
    }
  }

  if (scoped.length === 0) {
    return { state: "NOT_CONFIGURED", reason: "NONE_APPLICABLE" };
  }

  const occurrences: ResolvedCycleOccurrence[] = [];
  for (const cycle of scoped) {
    const window = resolveCycleWindowInstants({
      operationalDateKey: input.operationalDateKey,
      startLocal: cycle.startLocal,
      endLocal: cycle.endLocal,
      overnight: cycle.overnight,
      facilityTimezone: input.facilityTimezone,
    });
    if (!window) continue;
    occurrences.push(toOccurrence(cycle, window));
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
    .sort(compareCycleOrder);

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

/** Neutral factual copy for runtime cards. Never invents a meal or blames another department. */
export function describeOperationalCycleContext(context: OperationalCycleContext): string {
  switch (context.state) {
    case "NOT_APPLICABLE":
      return "Operational cycles do not apply to this location.";
    case "NOT_CONFIGURED":
      return context.reason === "NO_PUBLISHED_CYCLES"
        ? "No published operational cycles are configured for this department."
        : "No operational cycles apply for this date.";
    case "ACTIVE":
      return `${context.primary.label} is active.`;
    case "UPCOMING":
      return `Next cycle: ${context.next.label}.`;
    case "BETWEEN":
      return `${context.previous.label} has ended. Next: ${context.next.label}.`;
    case "DAY_COMPLETE":
      return `All configured cycles for today have passed. Last: ${context.last.label}.`;
  }
}

/** Unit types that typically participate in Dietary meal-service cycle runtime. */
export const DIETARY_CYCLE_UNIT_TYPES: ReadonlySet<UnitType> = new Set([
  "SERVERY",
  "KITCHEN",
  "RETAIL",
]);
