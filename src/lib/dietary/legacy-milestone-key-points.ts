/**
 * Move a Food & Nutrition Cycle that still expects READY / SERVICE_STARTED
 * onto the Dietary Key Points for that meal. The Key Point stable keys are
 * the ones meal timing records. A Cycle whose meal cannot be named is left
 * unchanged.
 */

import { buildDietaryDefaultCyclePlans, type DietaryDefaultCyclePlan } from "@/lib/operational-cycles/defaults";

import { dietaryMealKeyFromType, type DietaryMealKey } from "./meal-timing";

const MILESTONES = new Set(["READY", "SERVICE_STARTED"]);

export type LegacyMilestoneCycle = {
  id: string;
  departmentId: string;
  stableKey: string;
  mealType: string | null;
  nodeKind: string;
  status: string;
  expectedMilestones: readonly string[];
};

export type LegacyMilestoneKeyPointCreate = {
  departmentId: string;
  parentStableKey: string;
  plan: DietaryDefaultCyclePlan;
};

export type LegacyMilestoneKeyPointPlan = {
  clearCycleIds: string[];
  unmappedCycleIds: string[];
  creates: LegacyMilestoneKeyPointCreate[];
};

function mealKeyFor(cycle: LegacyMilestoneCycle): DietaryMealKey | null {
  const fromType = cycle.mealType ? dietaryMealKeyFromType(cycle.mealType) : null;
  if (fromType) return fromType;
  if (cycle.stableKey === "breakfast" || cycle.stableKey === "lunch" || cycle.stableKey === "dinner") {
    return cycle.stableKey;
  }
  return null;
}

function expectsLegacyMilestone(cycle: LegacyMilestoneCycle): boolean {
  if (cycle.nodeKind === "KEY_TIME") return false;
  if (cycle.status !== "DRAFT" && cycle.status !== "PUBLISHED") return false;
  return cycle.expectedMilestones.some((milestone) => MILESTONES.has(milestone));
}

export function planLegacyMilestoneKeyPoints(input: {
  cycles: readonly LegacyMilestoneCycle[];
  occupiedStableKeysByDepartment: ReadonlyMap<string, readonly string[]>;
}): LegacyMilestoneKeyPointPlan {
  const product = buildDietaryDefaultCyclePlans().filter((plan) => plan.nodeKind === "KEY_TIME");
  const owners = input.cycles.filter(expectsLegacyMilestone);
  const clearCycleIds: string[] = [];
  const unmappedCycleIds: string[] = [];
  const creates: LegacyMilestoneKeyPointCreate[] = [];
  const seenCreate = new Set<string>();

  const byDepartmentMeal = new Map<string, LegacyMilestoneCycle[]>();
  for (const cycle of owners) {
    const meal = mealKeyFor(cycle);
    if (!meal) {
      unmappedCycleIds.push(cycle.id);
      continue;
    }
    const key = `${cycle.departmentId}:${meal}`;
    const list = byDepartmentMeal.get(key) ?? [];
    list.push(cycle);
    byDepartmentMeal.set(key, list);
  }

  for (const [key, cycles] of byDepartmentMeal) {
    const [departmentId, meal] = key.split(":") as [string, DietaryMealKey];
    const parent =
      cycles.find((cycle) => cycle.stableKey === meal) ??
      cycles.find((cycle) => cycle.status === "PUBLISHED") ??
      cycles[0]!;
    const occupied = new Set(input.occupiedStableKeysByDepartment.get(departmentId) ?? []);
    for (const plan of product) {
      if (!plan.stableKey.startsWith(`${meal}_`)) continue;
      if (occupied.has(plan.stableKey)) continue;
      const createKey = `${departmentId}:${plan.stableKey}`;
      if (seenCreate.has(createKey)) continue;
      seenCreate.add(createKey);
      creates.push({
        departmentId,
        parentStableKey: parent.stableKey,
        plan: { ...plan, parentStableKey: parent.stableKey },
      });
    }
    clearCycleIds.push(...cycles.map((cycle) => cycle.id));
  }

  return { clearCycleIds, unmappedCycleIds, creates };
}
