import assert from "node:assert/strict";
import test from "node:test";

import { resolveCurrentExpectation } from "./expectation";

test("PREPARATION shows guidance and Ready as next when expected", () => {
  const r = resolveCurrentExpectation({
    cycleType: "PREPARATION",
    description: "Prepare the servery for lunch.",
    label: "Lunch Preparation",
    expectedMilestones: ["READY"],
    mealTargetTime: "12:15",
    milestoneKey: "NOT_CONFIRMED",
    readyConfirmed: false,
    startedConfirmed: false,
  });
  assert.equal(r.expectation, "Prepare the servery for lunch.");
  assert.match(r.nextMilestoneExpectation ?? "", /Servery Ready/i);
});

test("SERVICE shows UnitMealTime target; Ready separate; Started when not confirmed", () => {
  const r = resolveCurrentExpectation({
    cycleType: "SERVICE",
    description: null,
    label: "Lunch Service",
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    mealTargetTime: "12:15",
    milestoneKey: "READY_CONFIRMED",
    readyConfirmed: true,
    startedConfirmed: false,
  });
  assert.match(r.expectation, /Ready is confirmed/i);
  assert.match(r.expectation, /12:15/);
  assert.match(r.nextMilestoneExpectation ?? "", /Meal Service Started/i);
});

test("SERVICE factual when Started confirmed", () => {
  const r = resolveCurrentExpectation({
    cycleType: "SERVICE",
    description: null,
    label: "Lunch Service",
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    mealTargetTime: "12:15",
    milestoneKey: "SERVICE_STARTED",
    readyConfirmed: true,
    startedConfirmed: true,
  });
  assert.match(r.expectation, /Started is confirmed/i);
  assert.equal(r.nextMilestoneExpectation, null);
});

test("TRANSITION / CLOSEOUT / CUSTOM use description only — no invented tasks", () => {
  for (const cycleType of ["TRANSITION", "CLOSEOUT", "CUSTOM"] as const) {
    const r = resolveCurrentExpectation({
      cycleType,
      description: "Approved department guidance only.",
      label: "Custom Label That Mentions Cleaning",
      expectedMilestones: [],
      mealTargetTime: null,
      milestoneKey: null,
      readyConfirmed: false,
      startedConfirmed: false,
    });
    assert.equal(r.expectation, "Approved department guidance only.");
    assert.equal(r.nextMilestoneExpectation, null);
    assert.doesNotMatch(r.expectation, /invent|checklist|log requirement/i);
  }
});

test("does not parse free text into tasks", () => {
  const r = resolveCurrentExpectation({
    cycleType: "CUSTOM",
    description: "1. Wipe counters 2. Check temps 3. Restock",
    label: "Closeout",
    expectedMilestones: [],
    mealTargetTime: null,
    milestoneKey: null,
    readyConfirmed: false,
    startedConfirmed: false,
  });
  assert.equal(r.expectation, "1. Wipe counters 2. Check temps 3. Restock");
  assert.equal(r.nextMilestoneExpectation, null);
});
