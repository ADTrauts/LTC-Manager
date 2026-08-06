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
