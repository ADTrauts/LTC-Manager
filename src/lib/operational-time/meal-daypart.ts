import type { MealType } from "@prisma/client";

import { resolveFacilityTimezone } from "./resolve-facility-timezone";
import { getFacilityLocalParts } from "./zoned-parts";

/**
 * Daypart hints for the meal-period selector (facility-local wall time).
 * Breakfast 4:00–10:30, Lunch 10:30–2:30, Dinner thereafter (incl. overnight to 4:00).
 */
export function getDefaultMealTypeForFacilityLocalTime(
  now: Date,
  facilityTimezone?: string | null,
): MealType {
  const parts = getFacilityLocalParts(now, resolveFacilityTimezone(facilityTimezone));
  const m = parts.hour * 60 + parts.minute;
  if (m >= 21 * 60) return "DINNER";
  if (m < 4 * 60) return "BREAKFAST";
  if (m < 10 * 60 + 30) return "BREAKFAST";
  if (m < 14 * 60 + 30) return "LUNCH";
  return "DINNER";
}

/** Picks a default tab among meals this servery actually serves. */
export function pickDefaultMealTypeForUnitSlots(
  available: MealType[],
  at: Date,
  facilityTimezone?: string | null,
): MealType {
  if (available.length === 0) return "BREAKFAST";
  const hint = getDefaultMealTypeForFacilityLocalTime(at, facilityTimezone);
  if (available.includes(hint)) return hint;
  const order: MealType[] = ["BREAKFAST", "LUNCH", "DINNER"];
  for (const meal of order) {
    if (available.includes(meal)) return meal;
  }
  return available[0]!;
}
