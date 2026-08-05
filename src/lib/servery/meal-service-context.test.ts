import assert from "node:assert/strict";
import test from "node:test";

import {
  describeMealServiceContext,
  recordableMealForContext,
  resolveServeryMealServiceContext,
  type ServeryMealSlot,
} from "./meal-service-context";

const TZ = "America/New_York";

/** An instant expressed in facility-local time, so cases read the way an operator would state them. */
function localTime(hhmm: string): Date {
  // 2026-07-08 is a fixed weekday in EDT (UTC-4).
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 6, 8, h! + 4, m!, 0));
}

const FULL_DAY: ServeryMealSlot[] = [
  { mealType: "BREAKFAST", scheduledTime: "07:30" },
  { mealType: "LUNCH", scheduledTime: "12:00" },
  { mealType: "DINNER", scheduledTime: "17:30" },
];

function resolve(slots: ServeryMealSlot[], at: string, unitType: "SERVERY" | "RESIDENT" = "SERVERY") {
  return resolveServeryMealServiceContext({
    unitType: unitType as never,
    mealTimes: slots,
    now: localTime(at),
    facilityTimezone: TZ,
  });
}

test("a non-servery unit is not applicable and offers no meal", () => {
  const context = resolve(FULL_DAY, "12:00", "RESIDENT");
  assert.equal(context.state, "NOT_APPLICABLE");
  assert.equal(recordableMealForContext(context), null);
});

test("a servery with no configured meal times is NOT_CONFIGURED, not breakfast", () => {
  const context = resolve([], "12:00");
  assert.equal(context.state, "NOT_CONFIGURED");
  assert.equal(recordableMealForContext(context), null);
  // The regression this guards: the previous code substituted BREAKFAST here, which invented a
  // meal occurrence for a servery that serves none.
  assert.match(describeMealServiceContext(context), /No serving times are configured/);
});

test("configured times that cannot be parsed are NOT_CONFIGURED rather than a guess", () => {
  const context = resolve([{ mealType: "LUNCH", scheduledTime: "not-a-time" }], "12:00");
  assert.equal(context.state, "NOT_CONFIGURED");
  assert.equal(recordableMealForContext(context), null);
});

test("inside a meal's window the meal is ACTIVE", () => {
  const context = resolve(FULL_DAY, "12:15");
  assert.equal(context.state, "ACTIVE");
  assert.equal(recordableMealForContext(context)?.mealType, "LUNCH");
});

test("the window opens an hour before and closes an hour after the serving time", () => {
  assert.equal(resolve(FULL_DAY, "11:00").state, "ACTIVE");
  assert.equal(resolve(FULL_DAY, "13:00").state, "ACTIVE");
  assert.notEqual(resolve(FULL_DAY, "10:30").state, "ACTIVE");
});

test("before the first meal's window the day is UPCOMING", () => {
  const context = resolve(FULL_DAY, "05:00");
  assert.equal(context.state, "UPCOMING");
  assert.equal(recordableMealForContext(context)?.mealType, "BREAKFAST");
});

test("after one meal and before the next the unit is BETWEEN meals", () => {
  const context = resolve(FULL_DAY, "10:00");
  assert.equal(context.state, "BETWEEN");
  if (context.state !== "BETWEEN") return;
  assert.equal(context.previous.mealType, "BREAKFAST");
  assert.equal(context.next.mealType, "LUNCH");
});

test("after the last meal's window the day is complete", () => {
  const context = resolve(FULL_DAY, "22:00");
  assert.equal(context.state, "DAY_COMPLETE");
  if (context.state !== "DAY_COMPLETE") return;
  assert.equal(context.last.mealType, "DINNER");
});

test("a partially configured servery only ever resolves to a meal it serves", () => {
  const dinnerOnly: ServeryMealSlot[] = [{ mealType: "DINNER", scheduledTime: "17:30" }];
  for (const at of ["05:00", "08:00", "12:00", "17:30", "22:00"]) {
    const meal = recordableMealForContext(resolve(dinnerOnly, at));
    if (meal) assert.equal(meal.mealType, "DINNER");
  }
});

test("every state produces operator copy and never blames another department", () => {
  const cases = [
    resolve(FULL_DAY, "12:15"),
    resolve(FULL_DAY, "05:00"),
    resolve(FULL_DAY, "10:00"),
    resolve(FULL_DAY, "22:00"),
    resolve([], "12:00"),
    resolve(FULL_DAY, "12:00", "RESIDENT"),
  ];
  for (const context of cases) {
    const copy = describeMealServiceContext(context);
    assert.ok(copy.length > 0, `${context.state} has copy`);
    assert.doesNotMatch(copy, /late|fault|failed to|blame/i, `${context.state} copy stays neutral`);
  }
});

test("slots are ordered by time regardless of the order they arrive in", () => {
  const shuffled: ServeryMealSlot[] = [
    { mealType: "DINNER", scheduledTime: "17:30" },
    { mealType: "BREAKFAST", scheduledTime: "07:30" },
    { mealType: "LUNCH", scheduledTime: "12:00" },
  ];
  const context = resolveServeryMealServiceContext({
    unitType: "SERVERY" as never,
    mealTimes: shuffled,
    now: localTime("05:00"),
    facilityTimezone: TZ,
  });
  assert.equal(context.state, "UPCOMING");
  if (context.state !== "UPCOMING") return;
  assert.equal(context.next.mealType, "BREAKFAST");
});
