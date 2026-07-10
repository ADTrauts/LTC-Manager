import type { MealType, UnitType } from "@prisma/client";

import type { OperationalDepartmentKey } from "@/lib/department-nav";

import type { ReadinessProfileKey } from "./types";

const DIETARY_UNIT_TYPES = new Set<UnitType>(["SERVERY", "KITCHEN", "RETAIL"]);
const EVS_UNIT_TYPES = new Set<UnitType>([
  "OFFICE",
  "STORAGE",
  "OTHER",
  "RESIDENT_AREA",
  "COMMON_AREA",
  "RESTROOM_CLUSTER",
  "EVS_ZONE",
  "GROUND",
]);
const PLANT_UNIT_TYPES = new Set<UnitType>(["MECHANICAL"]);

export function resolveProfileKeyFromUnitType(unitType: UnitType): ReadinessProfileKey {
  if (DIETARY_UNIT_TYPES.has(unitType)) return "DIETARY";
  if (PLANT_UNIT_TYPES.has(unitType)) return "PLANT";
  if (EVS_UNIT_TYPES.has(unitType)) return "EVS";
  return "NEUTRAL";
}

/**
 * Active department lens wins when provided. Otherwise fall back to the unit's
 * primary operational department, then unit-type heuristic.
 */
export function resolveUnitProfileKey(input: {
  activeDepartmentKey?: OperationalDepartmentKey | null;
  unitDepartmentKeys?: string[];
  unitType: UnitType;
}): ReadinessProfileKey {
  if (input.activeDepartmentKey) {
    return input.activeDepartmentKey;
  }

  const keys = input.unitDepartmentKeys ?? [];
  if (keys.includes("DIETARY")) return "DIETARY";
  if (keys.includes("EVS")) return "EVS";
  if (keys.includes("PLANT")) return "PLANT";

  return resolveProfileKeyFromUnitType(input.unitType);
}

export function mealLabelForType(mealType: MealType | null | undefined, fallback = "service"): string {
  if (!mealType) return fallback;
  const lower = mealType.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
