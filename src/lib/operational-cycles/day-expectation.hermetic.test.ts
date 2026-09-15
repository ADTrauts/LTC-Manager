import assert from "node:assert/strict";
import test from "node:test";

import {
  addMinutesToLocalTime,
  describeMealServiceTiming,
  expectedTodayTime,
  formatClock12,
} from "./day-expectation";
import { decideAdjustDayExpectationAuthority } from "./adjust-day-expectation";

test("expectedToday uses adjusted overlay without dropping configured", () => {
  assert.equal(expectedTodayTime({ configuredTime: "07:15", adjustedTime: null }), "07:15");
  assert.equal(expectedTodayTime({ configuredTime: "07:15", adjustedTime: "07:20" }), "07:20");
  assert.equal(expectedTodayTime({ configuredTime: null, adjustedTime: null }), null);
});

test("+5 is incremental from current expected today", () => {
  assert.equal(addMinutesToLocalTime("07:15", 5), "07:20");
  assert.equal(addMinutesToLocalTime("07:20", 5), "07:25");
  assert.equal(addMinutesToLocalTime("23:55", 10), "00:05");
});

test("on-time comparison uses expectedToday, not always configured", () => {
  const noAdjust = describeMealServiceTiming({
    configuredTime: "07:15",
    adjustedTime: null,
    actualLocalHhMm: "07:20",
  });
  assert.equal(noAdjust.key, "on_time");
  assert.equal(noAdjust.label, "On time");

  const lateVsConfiguredButOnAdjusted = describeMealServiceTiming({
    configuredTime: "07:15",
    adjustedTime: "07:20",
    actualLocalHhMm: "07:23",
  });
  assert.equal(lateVsConfiguredButOnAdjusted.key, "on_time");
  assert.match(lateVsConfiguredButOnAdjusted.label, /Adjusted to 7:20/);
  assert.match(lateVsConfiguredButOnAdjusted.label, /Started 7:23/);

  const lateVsAdjusted = describeMealServiceTiming({
    configuredTime: "07:15",
    adjustedTime: "07:20",
    actualLocalHhMm: "07:40",
  });
  assert.equal(lateVsAdjusted.key, "started_late");
});

test("missing configured time surfaces configuration-needed language", () => {
  const status = describeMealServiceTiming({
    configuredTime: null,
    adjustedTime: null,
    actualLocalHhMm: null,
  });
  assert.equal(status.key, "not_configured");
  assert.equal(status.label, "Expected time not configured");
});

test("not started keeps operational language", () => {
  const status = describeMealServiceTiming({
    configuredTime: "07:15",
    adjustedTime: "07:20",
  });
  assert.equal(status.key, "not_started");
  assert.equal(status.label, "Not started");
});

test("formatClock12 is staff-facing", () => {
  assert.equal(formatClock12("07:15"), "7:15 AM");
  assert.equal(formatClock12("19:05"), "7:05 PM");
});

test("adjust authority: supervisor and manager yes; employee staff no; cross-facility no", () => {
  assert.equal(
    decideAdjustDayExpectationAuthority({
      sessionFacilityId: "f1",
      expectationFacilityId: "f1",
      role: "SUPERVISOR",
      authKind: "user",
    }).allowed,
    true,
  );
  assert.equal(
    decideAdjustDayExpectationAuthority({
      sessionFacilityId: "f1",
      expectationFacilityId: "f1",
      role: "MANAGER",
      authKind: "user",
    }).allowed,
    true,
  );
  assert.equal(
    decideAdjustDayExpectationAuthority({
      sessionFacilityId: "f1",
      expectationFacilityId: "f1",
      role: "SUPERVISOR",
      authKind: "employee",
    }).allowed,
    true,
  );
  const staff = decideAdjustDayExpectationAuthority({
    sessionFacilityId: "f1",
    expectationFacilityId: "f1",
    role: "STAFF",
    authKind: "employee",
  });
  assert.equal(staff.allowed, false);
  if (!staff.allowed) assert.equal(staff.reason, "EMPLOYEE_FORBIDDEN");

  const userStaff = decideAdjustDayExpectationAuthority({
    sessionFacilityId: "f1",
    expectationFacilityId: "f1",
    role: "STAFF",
    authKind: "user",
  });
  assert.equal(userStaff.allowed, false);
  if (!userStaff.allowed) assert.equal(userStaff.reason, "ROLE_REQUIRED");

  const cross = decideAdjustDayExpectationAuthority({
    sessionFacilityId: "f1",
    expectationFacilityId: "f2",
    role: "MANAGER",
    authKind: "user",
  });
  assert.equal(cross.allowed, false);
  if (!cross.allowed) assert.equal(cross.reason, "CROSS_FACILITY");
});
