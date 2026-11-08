/**
 * Pure planner: which meal-service day expectations to persist for one operational date.
 * Existing rows freeze that cycle version's location set for the day.
 * Parent umbrella cycles without their own SERVICE_STARTED config do not duplicate child expectations.
 */

import { effectiveMealType } from "./cycle-hierarchy";
import {
  mealTimeNeighborhoodCandidates,
  shouldShowServiceStartTimes,
} from "./cycle-scope";
import type { CycleScopeLocationOption } from "./cycle-scope";
import type { OperationalCycleDefinition } from "./types";

export type PlannedDayExpectation = {
  cycleId: string;
  cycleStableKey: string;
  cycleVersion: number;
  cycleLabel: string;
  mealType: NonNullable<OperationalCycleDefinition["mealType"]>;
  unitId: string;
  milestone: "SERVICE_STARTED";
  configuredTime: string | null;
};

export type ExistingDayExpectationKey = {
  cycleId: string;
  cycleStableKey?: string;
  unitId: string;
  milestone: string;
};

export function planMealServiceDayExpectations(input: {
  cycles: readonly OperationalCycleDefinition[];
  locations: readonly CycleScopeLocationOption[];
  existing: readonly ExistingDayExpectationKey[];
}): PlannedDayExpectation[] {
  const serviceStarted = input.existing.filter((row) => row.milestone === "SERVICE_STARTED");
  const frozenCycleIds = new Set(serviceStarted.map((row) => row.cycleId));
  const frozenStableKeys = new Set(
    serviceStarted.map((row) => row.cycleStableKey).filter((key): key is string => Boolean(key)),
  );

  const hierarchyRows = input.cycles.map((cycle) => ({
    stableKey: cycle.stableKey,
    label: cycle.label,
    parentStableKey: cycle.parentStableKey,
    mealType: cycle.mealType,
    displaySequence: cycle.displaySequence,
  }));

  const planned: PlannedDayExpectation[] = [];

  for (const cycle of input.cycles) {
    if (cycle.status === "DRAFT") continue;
    // Frozen day: any rows for this version (or another version of the same stableKey)
    // mean do not rematerialize. createMany is atomic, so partial first-write is not expected.
    if (frozenCycleIds.has(cycle.id) || frozenStableKeys.has(cycle.stableKey)) continue;

    const mealType = effectiveMealType({
      mealType: cycle.mealType,
      stableKey: cycle.stableKey,
      rows: hierarchyRows,
    });

    if (
      !shouldShowServiceStartTimes({
        cycleType: cycle.cycleType,
        mealType,
        expectedMilestones: cycle.expectedMilestones,
      })
    ) {
      continue;
    }
    if (!mealType) continue;

    const candidates = mealTimeNeighborhoodCandidates({
      locationMode: cycle.locationMode,
      roomTypeKey: cycle.roomTypeKey,
      unitIds: cycle.unitIds,
      spaceIds: cycle.spaceIds,
      locations: input.locations,
    });

    const configuredByUnit = new Map<string, string>();
    for (const row of cycle.milestoneTimes) {
      if (row.milestone !== "SERVICE_STARTED") continue;
      configuredByUnit.set(row.unitId, row.configuredTime);
    }

    const instantiateAllCandidates = cycle.locationMode === "ROOM_TYPE";

    const unitIds = instantiateAllCandidates
      ? candidates.map((row) => row.unitId)
      : candidates
          .map((row) => row.unitId)
          .filter((unitId) => configuredByUnit.has(unitId));

    for (const unitId of unitIds) {
      planned.push({
        cycleId: cycle.id,
        cycleStableKey: cycle.stableKey,
        cycleVersion: cycle.version,
        cycleLabel: cycle.label,
        mealType,
        unitId,
        milestone: "SERVICE_STARTED",
        configuredTime: configuredByUnit.get(unitId) ?? null,
      });
    }
  }

  return planned;
}

export function timingOwnerUnitIds(unit: {
  id: string;
  parentUnitId?: string | null;
}): string[] {
  const ids = [unit.id];
  if (unit.parentUnitId && unit.parentUnitId !== unit.id) {
    ids.push(unit.parentUnitId);
  }
  return ids;
}

export function pickTimingForMeal<T extends { unitId: string; mealType: string }>(
  timings: readonly T[],
  ownerUnitIds: readonly string[],
  mealType: string,
): T | null {
  const owners = new Set(ownerUnitIds);
  return (
    timings.find((row) => owners.has(row.unitId) && row.mealType === mealType) ?? null
  );
}
