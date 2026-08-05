import type { MealType, UnitType } from "@prisma/client";

import {
  parseFacilityLocalScheduledStart,
  resolveFacilityTimezone,
} from "@/lib/operational-time";

/**
 * How long before and after a configured serving time the meal counts as active.
 *
 * The trailing side matches `SERVERY_SERVICE_WINDOW_MS` so a meal stays active for exactly as long
 * as a recorded milestone stays "live" on the boards.
 */
export const MEAL_ACTIVE_LEAD_MS = 60 * 60 * 1000;
export const MEAL_ACTIVE_TRAIL_MS = 60 * 60 * 1000;

const MEAL_ORDER: readonly MealType[] = ["BREAKFAST", "LUNCH", "DINNER"];

export type ServeryMealSlot = {
  mealType: MealType;
  scheduledTime: string;
};

/** A configured slot whose scheduled time resolved to a real instant on the operational day. */
export type ResolvedMealSlot = {
  mealType: MealType;
  scheduledTime: string;
  scheduledAt: Date;
};

/**
 * Deterministic meal-service state for one unit at one instant.
 *
 * Every variant that names a meal carries a valid `MealType`, and the variants that cannot name one
 * have no `mealType` field at all. A caller therefore cannot reach a null meal by following the
 * type, which is what made the previous code reachable only by a non-null assertion.
 */
export type ServeryMealServiceContext =
  /** The unit does not run the Dietary meal-service workflow. */
  | { state: "NOT_APPLICABLE" }
  /** The unit runs meal service but has no usable serving times configured. */
  | { state: "NOT_CONFIGURED"; reason: "NO_ACTIVE_SLOTS" | "UNREADABLE_TIMES" }
  /** A configured meal is inside its active window. */
  | { state: "ACTIVE"; meal: ResolvedMealSlot; minutesUntilService: number }
  /** No meal is active yet and the first meal of the day is still ahead. */
  | { state: "UPCOMING"; next: ResolvedMealSlot; minutesUntilService: number }
  /** A meal has finished and another remains later today. */
  | {
      state: "BETWEEN";
      previous: ResolvedMealSlot;
      next: ResolvedMealSlot;
      minutesUntilService: number;
    }
  /** Every configured meal for the operational day has passed. */
  | { state: "DAY_COMPLETE"; last: ResolvedMealSlot };

function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

/**
 * Resolve configured slots to instants on the operational day, dropping any whose stored time
 * cannot be parsed. Sorted by time so ordering never depends on how rows came back from the query.
 */
export function resolveMealSlots(
  slots: readonly ServeryMealSlot[],
  now: Date,
  facilityTimezone?: string | null,
): ResolvedMealSlot[] {
  const timezone = resolveFacilityTimezone(facilityTimezone);
  const resolved: ResolvedMealSlot[] = [];

  for (const slot of slots) {
    const scheduledAt = parseFacilityLocalScheduledStart(slot.scheduledTime, now, timezone);
    if (!scheduledAt) continue;
    resolved.push({ mealType: slot.mealType, scheduledTime: slot.scheduledTime, scheduledAt });
  }

  return resolved.sort(
    (a, b) =>
      a.scheduledAt.getTime() - b.scheduledAt.getTime() ||
      MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType),
  );
}

/**
 * Classify a unit's meal-service state without inventing a meal.
 *
 * A unit with no readable serving times reports `NOT_CONFIGURED` rather than defaulting to
 * Breakfast: a missing configuration and an actual breakfast service are different facts, and the
 * milestone workflow must not record the second when it only knows the first.
 */
export function resolveServeryMealServiceContext(input: {
  unitType: UnitType;
  mealTimes: readonly ServeryMealSlot[];
  now: Date;
  facilityTimezone?: string | null;
}): ServeryMealServiceContext {
  if (input.unitType !== "SERVERY") {
    return { state: "NOT_APPLICABLE" };
  }

  if (input.mealTimes.length === 0) {
    return { state: "NOT_CONFIGURED", reason: "NO_ACTIVE_SLOTS" };
  }

  const slots = resolveMealSlots(input.mealTimes, input.now, input.facilityTimezone);
  if (slots.length === 0) {
    return { state: "NOT_CONFIGURED", reason: "UNREADABLE_TIMES" };
  }

  const nowMs = input.now.getTime();

  const active = slots.find((slot) => {
    const start = slot.scheduledAt.getTime() - MEAL_ACTIVE_LEAD_MS;
    const end = slot.scheduledAt.getTime() + MEAL_ACTIVE_TRAIL_MS;
    return nowMs >= start && nowMs <= end;
  });
  if (active) {
    return {
      state: "ACTIVE",
      meal: active,
      minutesUntilService: minutesBetween(input.now, active.scheduledAt),
    };
  }

  const next = slots.find(
    (slot) => nowMs < slot.scheduledAt.getTime() - MEAL_ACTIVE_LEAD_MS,
  );
  const passed = slots.filter(
    (slot) => nowMs > slot.scheduledAt.getTime() + MEAL_ACTIVE_TRAIL_MS,
  );
  const previous = passed.length > 0 ? passed[passed.length - 1]! : null;

  if (next && previous) {
    return {
      state: "BETWEEN",
      previous,
      next,
      minutesUntilService: minutesBetween(input.now, next.scheduledAt),
    };
  }
  if (next) {
    return {
      state: "UPCOMING",
      next,
      minutesUntilService: minutesBetween(input.now, next.scheduledAt),
    };
  }
  if (previous) {
    return { state: "DAY_COMPLETE", last: previous };
  }

  // Unreachable while every slot is classified as active, future, or passed; kept so a future
  // change to the window arithmetic degrades to "not configured" instead of an invented meal.
  return { state: "NOT_CONFIGURED", reason: "UNREADABLE_TIMES" };
}

/** The meal a milestone press would target, or null when no meal applies right now. */
export function recordableMealForContext(
  context: ServeryMealServiceContext,
): ResolvedMealSlot | null {
  switch (context.state) {
    case "ACTIVE":
      return context.meal;
    case "UPCOMING":
      return context.next;
    case "BETWEEN":
      return context.next;
    case "DAY_COMPLETE":
      return context.last;
    case "NOT_CONFIGURED":
    case "NOT_APPLICABLE":
      return null;
  }
}

/** Neutral, factual copy. Never implies another department caused a delay. */
export function describeMealServiceContext(context: ServeryMealServiceContext): string {
  switch (context.state) {
    case "NOT_APPLICABLE":
      return "This location does not use meal service milestones.";
    case "NOT_CONFIGURED":
      return context.reason === "NO_ACTIVE_SLOTS"
        ? "No serving times are configured for this servery. Add them on the Units page to enable meal service milestones."
        : "The serving times configured for this servery could not be read. Check them on the Units page.";
    case "ACTIVE":
      return "Meal service is in its active window.";
    case "UPCOMING":
      return "No meal is active yet. The first meal of the day is still ahead.";
    case "BETWEEN":
      return "No meal is active. The next meal has not entered its service window.";
    case "DAY_COMPLETE":
      return "All configured meals for today have passed.";
  }
}
