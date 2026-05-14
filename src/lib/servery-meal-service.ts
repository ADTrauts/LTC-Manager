import type { MealType } from "@prisma/client";

/** How long a ready/started press stays “active” for meal boards and unit button labels. */
export const SERVERY_SERVICE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Daypart hints for the meal-period selector (local time).
 * Breakfast 4:00–10:30, Lunch 10:30–2:30, Dinner 2:30–3:30 (gap) and 3:30–9:00, and 9:00 p.m.–midnight.
 * 12:00–4:00 a.m. defaults to breakfast; after 9:00 p.m. defaults to dinner until midnight.
 */
export function getDefaultMealTypeForTimeOfDay(date: Date): MealType {
  const m = date.getHours() * 60 + date.getMinutes();
  if (m >= 21 * 60) return "DINNER";
  if (m < 4 * 60) return "BREAKFAST";
  if (m < 10 * 60 + 30) return "BREAKFAST";
  if (m < 14 * 60 + 30) return "LUNCH";
  return "DINNER";
}

/** Picks a default tab among meals this servery actually serves. */
export function pickDefaultMealTypeForUnitSlots(available: MealType[], at: Date): MealType {
  if (available.length === 0) return "BREAKFAST";
  const hint = getDefaultMealTypeForTimeOfDay(at);
  if (available.includes(hint)) return hint;
  const order: MealType[] = ["BREAKFAST", "LUNCH", "DINNER"];
  for (const meal of order) {
    if (available.includes(meal)) return meal;
  }
  return available[0]!;
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
