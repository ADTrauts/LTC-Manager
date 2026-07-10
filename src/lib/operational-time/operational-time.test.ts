import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOperationalTimeContext,
  DEFAULT_FACILITY_TIMEZONE,
  getFacilityLocalTodayWindow,
  resolveFacilityTimezone,
} from "@/lib/operational-time";

test("resolveFacilityTimezone defaults missing values to America/New_York", () => {
  assert.equal(resolveFacilityTimezone(null), DEFAULT_FACILITY_TIMEZONE);
  assert.equal(resolveFacilityTimezone(undefined), "America/New_York");
  assert.equal(resolveFacilityTimezone(""), "America/New_York");
});

test("resolveFacilityTimezone accepts a stored IANA timezone", () => {
  assert.equal(resolveFacilityTimezone("America/Chicago"), "America/Chicago");
});

test("buildOperationalTimeContext uses injected now and facility-local date", () => {
  const now = new Date("2026-07-08T16:30:00.000Z"); // 12:30 America/New_York (EDT)
  const ctx = buildOperationalTimeContext({
    now,
    facilityTimezone: "America/New_York",
    mealType: "LUNCH",
    mealLabel: "Lunch",
    operationPhase: "Execution",
    scheduledStartLocal: "11:30",
  });

  assert.equal(ctx.nowUtc.toISOString(), now.toISOString());
  assert.equal(ctx.facilityTimezone, "America/New_York");
  assert.equal(ctx.facilityLocalDate, "2026-07-08");
  assert.equal(ctx.mealType, "LUNCH");
  assert.equal(ctx.operationPhase, "Execution");
  assert.ok(ctx.minutesUntilScheduledStart != null);
  assert.equal(ctx.hasScheduledStartPassed, true);
  assert.ok((ctx.minutesSinceScheduledStart ?? 0) > 0);
});

test("buildOperationalTimeContext distinguishes before due, at due, and overdue", () => {
  const before = buildOperationalTimeContext({
    now: new Date("2026-07-08T11:00:00.000Z"),
    facilityTimezone: "UTC",
    scheduledStartLocal: "12:00",
  });
  assert.equal(before.hasScheduledStartPassed, false);
  assert.ok((before.minutesUntilScheduledStart ?? 0) > 0);
  assert.equal(before.isDueTimePassed(new Date("2026-07-08T12:00:00.000Z")), false);

  const atDue = buildOperationalTimeContext({
    now: new Date("2026-07-08T12:00:00.000Z"),
    facilityTimezone: "UTC",
    scheduledStartLocal: "12:00",
  });
  assert.equal(atDue.hasScheduledStartPassed, true);
  assert.equal(atDue.minutesUntilScheduledStart, 0);
  assert.equal(atDue.isDueTimePassed(new Date("2026-07-08T12:00:00.000Z")), true);

  const overdue = buildOperationalTimeContext({
    now: new Date("2026-07-08T13:00:00.000Z"),
    facilityTimezone: "UTC",
    scheduledStartLocal: "12:00",
  });
  assert.equal(overdue.hasScheduledStartPassed, true);
  assert.ok((overdue.minutesSinceScheduledStart ?? 0) >= 60);
  assert.equal(overdue.isDueTimePassed(new Date("2026-07-08T12:30:00.000Z")), true);
});

test("getFacilityLocalTodayWindow returns facility-local midnight bounds", () => {
  const now = new Date("2026-07-08T04:30:00.000Z"); // still Jul 7 evening in US/Eastern? 04:30 UTC = 00:30 EDT
  const window = getFacilityLocalTodayWindow("America/New_York", now);
  assert.ok(window.start.getTime() < now.getTime());
  assert.ok(window.end.getTime() > now.getTime());
  assert.ok(window.end.getTime() - window.start.getTime() >= 23 * 60 * 60 * 1000);
});
