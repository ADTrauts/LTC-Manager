import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOperationalTimeContext,
  DEFAULT_FACILITY_TIMEZONE,
  facilityLocalDateToServiceDate,
  getFacilityLocalTodayWindow,
  getFacilityServiceDate,
  resolveFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

test("resolveFacilityTimezone prefers stored timezone over fallback", () => {
  assert.equal(resolveFacilityTimezone("America/Chicago"), "America/Chicago");
  assert.equal(resolveFacilityTimezone(null), DEFAULT_FACILITY_TIMEZONE);
  assert.equal(resolveFacilityTimezone("Not/A_Zone"), DEFAULT_FACILITY_TIMEZONE);
});

test("Buffalo/New York local date near UTC midnight stays on the prior local evening", () => {
  // 2026-07-09 03:30 UTC = 2026-07-08 23:30 America/New_York
  const now = new Date("2026-07-09T03:30:00.000Z");
  const ctx = buildOperationalTimeContext({
    now,
    facilityTimezone: "America/New_York",
  });
  assert.equal(ctx.facilityLocalDate, "2026-07-08");
  assert.equal(toServiceDateKey(getFacilityServiceDate("America/New_York", now)), "2026-07-08");
});

test("Central, Mountain, and Pacific date boundaries differ near UTC midnight", () => {
  const now = new Date("2026-07-09T05:30:00.000Z");
  assert.equal(
    buildOperationalTimeContext({ now, facilityTimezone: "America/Chicago" }).facilityLocalDate,
    "2026-07-09",
  );
  assert.equal(
    buildOperationalTimeContext({ now, facilityTimezone: "America/Denver" }).facilityLocalDate,
    "2026-07-08",
  );
  assert.equal(
    buildOperationalTimeContext({ now, facilityTimezone: "America/Los_Angeles" }).facilityLocalDate,
    "2026-07-08",
  );
});

test("daylight-saving spring forward keeps local midnight window continuous", () => {
  // US DST spring forward 2026-03-08: 02:00 → 03:00 in America/New_York
  const before = new Date("2026-03-08T06:30:00.000Z"); // 01:30 EST
  const after = new Date("2026-03-08T07:30:00.000Z"); // 03:30 EDT
  const windowBefore = getFacilityLocalTodayWindow("America/New_York", before);
  const windowAfter = getFacilityLocalTodayWindow("America/New_York", after);

  assert.equal(toServiceDateKey(getFacilityServiceDate("America/New_York", before)), "2026-03-08");
  assert.equal(toServiceDateKey(getFacilityServiceDate("America/New_York", after)), "2026-03-08");
  assert.equal(windowBefore.start.getTime(), windowAfter.start.getTime());
  assert.ok(windowBefore.end.getTime() > windowBefore.start.getTime());
  // Spring-forward day is 23 local hours → end is 23h after start in absolute time.
  assert.equal(windowBefore.end.getTime() - windowBefore.start.getTime(), 23 * 60 * 60 * 1000);
});

test("serviceDate for operation instances uses facility-local calendar date as UTC midnight", () => {
  const now = new Date("2026-07-09T03:30:00.000Z"); // still Jul 8 in NY
  const serviceDate = getFacilityServiceDate("America/New_York", now);
  assert.equal(serviceDate.toISOString(), "2026-07-08T00:00:00.000Z");
  assert.equal(toServiceDateKey(facilityLocalDateToServiceDate("2026-07-08")), "2026-07-08");
});

test("invalid timezone falls back safely for windows", () => {
  const now = new Date("2026-07-08T16:00:00.000Z");
  assert.equal(resolveFacilityTimezone("Invalid/Zone"), "America/New_York");
  const window = getFacilityLocalTodayWindow("Invalid/Zone", now);
  assert.ok(window.start.getTime() < now.getTime());
  assert.ok(window.end.getTime() > now.getTime());
});
