/**
 * Dietary Product timing content.
 * Shared Cycle logic does not branch on MealType. This module owns the
 * Product stable keys for Meal Due, Ready, and Service Started.
 *
 * Ready is a Dietary Key Point, not derived Work. Opening checks are Work
 * bound to breakfast_prep. They do not answer whether every required opening
 * step for a Food Service Area is satisfied.
 */

import {
  presentKeyPointRuntime,
  type KeyPointActualFact,
  type KeyPointRuntimeState,
  type OccurrenceTracking,
} from "@/lib/operational-cycles/cycle-canonical";
import { buildDietaryDefaultCyclePlans } from "@/lib/operational-cycles/defaults";

export const FOOD_SERVICE_AREA_FUNCTION_KEY = "food_service_area";

export const DIETARY_MEAL_KEYS = ["breakfast", "lunch", "dinner"] as const;
export type DietaryMealKey = (typeof DIETARY_MEAL_KEYS)[number];

export type DietaryTimingMoment = "due" | "ready" | "service_started";

const MEAL_KEY_BY_TYPE = {
  BREAKFAST: "breakfast",
  LUNCH: "lunch",
  DINNER: "dinner",
} as const;

export function dietaryMealKeyFromType(
  mealType: string,
): DietaryMealKey | null {
  if (mealType in MEAL_KEY_BY_TYPE) {
    return MEAL_KEY_BY_TYPE[mealType as keyof typeof MEAL_KEY_BY_TYPE];
  }
  return null;
}

export function dietaryTimingStableKey(
  meal: DietaryMealKey,
  moment: DietaryTimingMoment,
): string {
  return `${meal}_${moment}`;
}

export function dietaryTimingForLegacyControl(input: {
  mealType: string;
  eventType: "READY" | "STARTED";
}): { meal: DietaryMealKey; moment: DietaryTimingMoment; stableKey: string } | null {
  const meal = dietaryMealKeyFromType(input.mealType);
  if (!meal) return null;
  const moment: DietaryTimingMoment = input.eventType === "READY" ? "ready" : "service_started";
  return { meal, moment, stableKey: dietaryTimingStableKey(meal, moment) };
}

export function occurrenceTrackingForMoment(moment: DietaryTimingMoment): OccurrenceTracking {
  return moment === "due" ? "NONE" : "REQUIRED";
}

export function presentDietaryMoment(input: {
  moment: DietaryTimingMoment;
  plannedDueLocal: string;
  adjustedDueLocal?: string | null;
  nowLocal: string;
  actuals?: readonly KeyPointActualFact[];
}): KeyPointRuntimeState {
  return presentKeyPointRuntime({
    tracking: occurrenceTrackingForMoment(input.moment),
    plannedDueLocal: input.plannedDueLocal,
    adjustedDueLocal: input.adjustedDueLocal,
    nowLocal: input.nowLocal,
    actuals: input.actuals,
  });
}

export type DietaryMealTimingModel =
  | "CANONICAL_KEY_POINTS"
  | "LEGACY_MILESTONES"
  | "NOT_CONFIGURED";

export type EffectiveTimingCycle = {
  stableKey: string;
  nodeKind?: string | null;
  mealType?: string | null;
  expectedMilestones?: readonly string[] | null;
  parentStableKey?: string | null;
  status?: string | null;
  version?: number | null;
};

const LEGACY_MILESTONE_KEYS = new Set(["READY", "SERVICE_STARTED"]);

/** One governing row per stableKey. A later version wins when windows overlap. */
export function governingTimingCycles(
  cycles: readonly EffectiveTimingCycle[],
): EffectiveTimingCycle[] {
  const byKey = new Map<string, EffectiveTimingCycle>();
  for (const cycle of cycles) {
    const previous = byKey.get(cycle.stableKey);
    if (!previous || (cycle.version ?? 0) >= (previous.version ?? 0)) {
      byKey.set(cycle.stableKey, cycle);
    }
  }
  return [...byKey.values()];
}

function isLegacyDietaryMealCycle(
  cycle: EffectiveTimingCycle,
  meal: DietaryMealKey,
): boolean {
  const mealType = meal.toUpperCase();
  const milestones = cycle.expectedMilestones ?? [];
  const hasLegacyMilestone = milestones.some((milestone) => LEGACY_MILESTONE_KEYS.has(milestone));
  const productRoot =
    cycle.stableKey === meal &&
    (cycle.nodeKind ?? "PERIOD") === "PERIOD" &&
    !cycle.parentStableKey;
  if (productRoot) return true;
  if (cycle.mealType === mealType && hasLegacyMilestone) return true;
  if (hasLegacyMilestone && cycle.parentStableKey === meal) return true;
  return false;
}

/**
 * Authoritative timing model for one meal action on one service date.
 * `effectiveCycles` must already be the published set effective on that date.
 */
export function selectDietaryMealTimingModel(input: {
  mealType: string;
  eventType: "READY" | "STARTED";
  effectiveCycles: readonly EffectiveTimingCycle[];
}): DietaryMealTimingModel {
  const mapped = dietaryTimingForLegacyControl({
    mealType: input.mealType,
    eventType: input.eventType,
  });
  if (!mapped) return "NOT_CONFIGURED";
  const cycles = governingTimingCycles(input.effectiveCycles);
  const canonical = cycles.some(
    (cycle) =>
      cycle.stableKey === mapped.stableKey &&
      (cycle.nodeKind ?? "KEY_TIME") === "KEY_TIME",
  );
  if (canonical) return "CANONICAL_KEY_POINTS";
  if (cycles.some((cycle) => isLegacyDietaryMealCycle(cycle, mapped.meal))) {
    return "LEGACY_MILESTONES";
  }
  return "NOT_CONFIGURED";
}

export function dietaryTimingWriteTarget(
  model: DietaryMealTimingModel,
): "canonical" | "legacy" | "none" {
  if (model === "CANONICAL_KEY_POINTS") return "canonical";
  if (model === "LEGACY_MILESTONES") return "legacy";
  return "none";
}

export function dietaryMealTimingUpgradeRequired(
  effectiveCycles: readonly EffectiveTimingCycle[],
): boolean {
  return (["BREAKFAST", "LUNCH", "DINNER"] as const).some((mealType) =>
    (["READY", "STARTED"] as const).some(
      (eventType) =>
        selectDietaryMealTimingModel({ mealType, eventType, effectiveCycles }) ===
        "LEGACY_MILESTONES",
    ),
  );
}

export function canonicalTimingOwnsMoment(input: {
  cycles: readonly EffectiveTimingCycle[];
  mealType: string;
  milestone: "READY" | "SERVICE_STARTED";
}): boolean {
  return (
    selectDietaryMealTimingModel({
      mealType: input.mealType,
      eventType: input.milestone === "READY" ? "READY" : "STARTED",
      effectiveCycles: input.cycles,
    }) === "CANONICAL_KEY_POINTS"
  );
}

export type LegacyMealFact = {
  milestone: "READY" | "SERVICE_STARTED";
  occurredAt: string;
};

/**
 * Historical facts follow the Cycle version effective on the service date.
 * Timestamps are not compared, and a row in the other store is not shown.
 */
export function selectMealTimingFacts<TCanonical>(input: {
  mealType: string;
  eventType: "READY" | "STARTED";
  effectiveCycles: readonly EffectiveTimingCycle[];
  canonical: readonly TCanonical[];
  legacy: readonly LegacyMealFact[];
}): {
  model: DietaryMealTimingModel;
  canonical: readonly TCanonical[];
  legacy: readonly LegacyMealFact[];
} {
  const model = selectDietaryMealTimingModel({
    mealType: input.mealType,
    eventType: input.eventType,
    effectiveCycles: input.effectiveCycles,
  });
  if (model === "CANONICAL_KEY_POINTS") {
    return { model, canonical: input.canonical, legacy: [] };
  }
  if (model === "LEGACY_MILESTONES") {
    return { model, canonical: [], legacy: input.legacy };
  }
  return { model, canonical: [], legacy: [] };
}

/** Keep a legacy milestone only when that service date's Cycle version still owns it. */
export function selectAuthoritativeLegacyMilestones<
  T extends { mealType: string; milestone: string },
>(facts: readonly T[], effectiveCycles: readonly EffectiveTimingCycle[]): T[] {
  return facts.filter((fact) => {
    if (fact.milestone !== "READY" && fact.milestone !== "SERVICE_STARTED") return false;
    return (
      selectDietaryMealTimingModel({
        mealType: fact.mealType,
        eventType: fact.milestone === "READY" ? "READY" : "STARTED",
        effectiveCycles,
      }) === "LEGACY_MILESTONES"
    );
  });
}

/**
 * Draft successor for a legacy published meal Cycle.
 * Does not publish. Skips stable keys that already exist as drafts or published rows.
 * Ready and Service Started are created with occurrence tracking REQUIRED.
 * That is the Dietary Product contract for those Key Points. Other draft fields stay editable.
 */
export function planDietaryTimingUpgrade(input: {
  effectiveCycles: readonly EffectiveTimingCycle[];
  occupiedStableKeys: readonly string[];
  draftStableKeys: readonly string[];
}) {
  const occupied = new Set(input.occupiedStableKeys);
  const drafts = new Set(input.draftStableKeys);
  const productPlans = buildDietaryDefaultCyclePlans();
  const forkStableKeys: DietaryMealKey[] = [];
  const createStableKeys: string[] = [];
  for (const meal of DIETARY_MEAL_KEYS) {
    const legacy = (["READY", "STARTED"] as const).some(
      (eventType) =>
        selectDietaryMealTimingModel({
          mealType: meal.toUpperCase(),
          eventType,
          effectiveCycles: input.effectiveCycles,
        }) === "LEGACY_MILESTONES",
    );
    if (!legacy) continue;
    if (!drafts.has(meal)) forkStableKeys.push(meal);
    for (const moment of ["due", "ready", "service_started"] as const) {
      const stableKey = dietaryTimingStableKey(meal, moment);
      if (!occupied.has(stableKey)) createStableKeys.push(stableKey);
    }
  }
  return {
    forkStableKeys,
    createPlans: productPlans.filter((plan) => createStableKeys.includes(plan.stableKey)),
  };
}
