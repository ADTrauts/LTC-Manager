import assert from "node:assert/strict";
import test from "node:test";

import {
  cycleMilestoneStatusLabel,
  resolveCycleMilestoneStatus,
} from "./milestone-cycle-status";

const target = new Date("2026-08-06T12:00:00.000Z");

test("missing event is Not Confirmed never did-not-happen", () => {
  const status = resolveCycleMilestoneStatus({
    event: null,
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    mealTargetAt: target,
    now: target,
  });
  assert.equal(status.key, "NOT_CONFIRMED");
  assert.equal(status.label, "Not Confirmed");
  assert.doesNotMatch(status.label, /did not happen/i);
});

test("Ready Confirmed when ready recorded", () => {
  const status = resolveCycleMilestoneStatus({
    event: {
      mealType: "BREAKFAST",
      mealServiceReadyAt: new Date("2026-08-06T11:50:00.000Z"),
      mealServiceStartedAt: null,
    },
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    mealTargetAt: target,
    now: new Date("2026-08-06T11:55:00.000Z"),
  });
  assert.equal(status.key, "READY_CONFIRMED");
  assert.equal(cycleMilestoneStatusLabel(status.key), "Ready Confirmed");
});

test("Service Started when started on time", () => {
  const status = resolveCycleMilestoneStatus({
    event: {
      mealType: "BREAKFAST",
      mealServiceReadyAt: new Date("2026-08-06T11:50:00.000Z"),
      mealServiceStartedAt: new Date("2026-08-06T12:05:00.000Z"),
    },
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    mealTargetAt: target,
    now: new Date("2026-08-06T12:10:00.000Z"),
  });
  assert.equal(status.key, "SERVICE_STARTED");
});

test("Late when started past grace", () => {
  const status = resolveCycleMilestoneStatus({
    event: {
      mealType: "BREAKFAST",
      mealServiceReadyAt: new Date("2026-08-06T11:50:00.000Z"),
      mealServiceStartedAt: new Date("2026-08-06T12:30:00.000Z"),
    },
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    mealTargetAt: target,
    now: new Date("2026-08-06T12:35:00.000Z"),
  });
  assert.equal(status.key, "SERVICE_STARTED_LATE");
  assert.equal(status.label, "Late");
});

test("Started Without Ready", () => {
  const status = resolveCycleMilestoneStatus({
    event: {
      mealType: "BREAKFAST",
      mealServiceReadyAt: null,
      mealServiceStartedAt: new Date("2026-08-06T12:05:00.000Z"),
    },
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    mealTargetAt: target,
    now: new Date("2026-08-06T12:10:00.000Z"),
  });
  assert.equal(status.key, "STARTED_WITHOUT_READY");
});

test("Corrected and Conflict Review", () => {
  const corrected = resolveCycleMilestoneStatus({
    event: {
      mealType: "BREAKFAST",
      mealServiceReadyAt: new Date("2026-08-06T11:50:00.000Z"),
      mealServiceStartedAt: new Date("2026-08-06T12:05:00.000Z"),
      hasCorrection: true,
    },
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    mealTargetAt: target,
    now: new Date("2026-08-06T12:10:00.000Z"),
  });
  assert.equal(corrected.key, "CORRECTED");

  const conflict = resolveCycleMilestoneStatus({
    event: {
      mealType: "BREAKFAST",
      mealServiceReadyAt: new Date("2026-08-06T11:50:00.000Z"),
      mealServiceStartedAt: new Date("2026-08-06T12:05:00.000Z"),
      conflictReview: true,
    },
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    mealTargetAt: target,
    now: new Date("2026-08-06T12:10:00.000Z"),
  });
  assert.equal(conflict.key, "CONFLICT_REVIEW");
});
