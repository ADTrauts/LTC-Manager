import type { MealType } from "@prisma/client";

import {
  getDefaultMealTypeForFacilityLocalTime,
  pickDefaultMealTypeForUnitSlots as pickDefaultMealTypeForUnitSlotsFacility,
} from "@/lib/operational-time";

/** How long a ready/started press stays “active” for meal boards and unit button labels. */
export const SERVERY_SERVICE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Daypart hints for the meal-period selector using facility-local wall time.
 * Pass `facilityTimezone` whenever available; missing/invalid values fall back to America/New_York.
 */
export function getDefaultMealTypeForTimeOfDay(
  date: Date,
  facilityTimezone?: string | null,
): MealType {
  return getDefaultMealTypeForFacilityLocalTime(date, facilityTimezone);
}

/** Picks a default tab among meals this servery actually serves. */
export function pickDefaultMealTypeForUnitSlots(
  available: MealType[],
  at: Date,
  facilityTimezone?: string | null,
): MealType {
  return pickDefaultMealTypeForUnitSlotsFacility(available, at, facilityTimezone);
}

export function isWithinServeryLiveWindow(at: Date | null, now: Date): boolean {
  if (!at) return false;
  return now.getTime() - at.getTime() < SERVERY_SERVICE_WINDOW_MS;
}

/** Shown on live controls: time only while within the window; otherwise cleared. */
export function formatServeryLiveStamp(at: Date | null, now: Date): string {
  if (!at || !isWithinServeryLiveWindow(at, now)) return "Not recorded";
  return at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function isServerySlotLiveForBoard(args: {
  mealServiceReadyAt: Date | null;
  mealServiceStartedAt: Date | null;
  now: Date;
}): boolean {
  return (
    isWithinServeryLiveWindow(args.mealServiceReadyAt, args.now) ||
    isWithinServeryLiveWindow(args.mealServiceStartedAt, args.now)
  );
}
