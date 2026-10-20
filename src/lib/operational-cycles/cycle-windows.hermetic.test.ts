import assert from "node:assert/strict";
import test from "node:test";

import {
  isApplicableWeekday,
  isStructurallyOvernight,
  parseLocalTime,
  resolveCycleWindowInstants,
  windowsOverlap,
} from "./cycle-windows";

test("parseLocalTime accepts HH:mm and rejects invalid", () => {
  assert.deepEqual(parseLocalTime("07:30"), { hours: 7, minutes: 30 });
  assert.deepEqual(parseLocalTime("7:05"), { hours: 7, minutes: 5 });
  assert.equal(parseLocalTime("25:00"), null);
  assert.equal(parseLocalTime("abc"), null);
});

test("isStructurallyOvernight when flag or end before start", () => {
  assert.equal(isStructurallyOvernight("22:00", "06:00", false), true);
  assert.equal(isStructurallyOvernight("07:00", "09:00", true), true);
  assert.equal(isStructurallyOvernight("07:00", "09:00", false), false);
});

test("resolveCycleWindowInstants same-day window", () => {
  const window = resolveCycleWindowInstants({
    operationalDateKey: "2026-08-06",
    startLocal: "07:00",
    endLocal: "09:00",
    overnight: false,
    facilityTimezone: "America/New_York",
  });
  assert.ok(window);
  assert.ok(window!.endsAt.getTime() > window!.startsAt.getTime());
  assert.equal(
    Math.round((window!.endsAt.getTime() - window!.startsAt.getTime()) / 60_000),
    120,
  );
});

test("resolveCycleWindowInstants overnight end is next day", () => {
  const window = resolveCycleWindowInstants({
    operationalDateKey: "2026-08-06",
    startLocal: "22:00",
    endLocal: "06:00",
    overnight: true,
    facilityTimezone: "America/New_York",
  });
  assert.ok(window);
  assert.ok(window!.endsAt.getTime() > window!.startsAt.getTime());
  const hours =
    (window!.endsAt.getTime() - window!.startsAt.getTime()) / (60 * 60 * 1000);
  assert.ok(hours >= 7.5 && hours <= 8.5);
});

for (const [timezone, startsAt, endsAt] of [
  ["Pacific/Auckland", "2026-10-19T11:00:00.000Z", "2026-10-20T10:59:00.000Z"],
  ["Pacific/Kiritimati", "2026-10-19T10:00:00.000Z", "2026-10-20T09:59:00.000Z"],
  ["Pacific/Pago_Pago", "2026-10-20T11:00:00.000Z", "2026-10-21T10:59:00.000Z"],
  ["America/New_York", "2026-10-20T04:00:00.000Z", "2026-10-21T03:59:00.000Z"],
  ["Asia/Kolkata", "2026-10-19T18:30:00.000Z", "2026-10-20T18:29:00.000Z"],
]) {
  test(`explicit cycle service date stays on its Facility civil day in ${timezone}`, () => {
    const window = resolveCycleWindowInstants({
      operationalDateKey: "2026-10-20", startLocal: "00:00", endLocal: "23:59", facilityTimezone: timezone,
    });
    assert.equal(window?.startsAt.toISOString(), startsAt);
    assert.equal(window?.endsAt.toISOString(), endsAt);
  });
}

test("Auckland overnight window advances the civil day across daylight-saving end", () => {
  const window = resolveCycleWindowInstants({
    operationalDateKey: "2026-04-04", startLocal: "22:00", endLocal: "06:00", facilityTimezone: "Pacific/Auckland",
  });
  assert.equal(window?.startsAt.toISOString(), "2026-04-04T09:00:00.000Z");
  assert.equal(window?.endsAt.toISOString(), "2026-04-04T18:00:00.000Z");
});

test("explicit cycle dates retain the existing DST gap approximation and fold choice", () => {
  const gap = resolveCycleWindowInstants({
    operationalDateKey: "2026-03-08", startLocal: "02:30", endLocal: "08:00", facilityTimezone: "America/New_York",
  });
  assert.equal(gap?.startsAt.toISOString(), "2026-03-08T07:30:00.000Z");
  assert.equal(gap?.endsAt.toISOString(), "2026-03-08T12:00:00.000Z");
  const fold = resolveCycleWindowInstants({
    operationalDateKey: "2026-11-01", startLocal: "01:30", endLocal: "08:00", facilityTimezone: "America/New_York",
  });
  assert.equal(fold?.startsAt.toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(fold?.endsAt.toISOString(), "2026-11-01T13:00:00.000Z");
});

test("windowsOverlap detects intersection", () => {
  const a = resolveCycleWindowInstants({
    operationalDateKey: "2026-08-06",
    startLocal: "07:00",
    endLocal: "09:00",
    facilityTimezone: "UTC",
  })!;
  const b = resolveCycleWindowInstants({
    operationalDateKey: "2026-08-06",
    startLocal: "08:30",
    endLocal: "10:00",
    facilityTimezone: "UTC",
  })!;
  const c = resolveCycleWindowInstants({
    operationalDateKey: "2026-08-06",
    startLocal: "09:00",
    endLocal: "11:00",
    facilityTimezone: "UTC",
  })!;
  assert.equal(windowsOverlap(a.startsAt, a.endsAt, b.startsAt, b.endsAt), true);
  assert.equal(windowsOverlap(a.startsAt, a.endsAt, c.startsAt, c.endsAt), false);
});

test("isApplicableWeekday uses civil weekday", () => {
  // 2026-08-06 is Thursday = 4
  assert.equal(isApplicableWeekday([4], "2026-08-06", "America/New_York"), true);
  assert.equal(isApplicableWeekday([1], "2026-08-06", "America/New_York"), false);
  assert.equal(isApplicableWeekday([], "2026-08-06"), false);
});
