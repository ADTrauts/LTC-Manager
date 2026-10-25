import assert from "node:assert/strict";
import test from "node:test";

import { planLegacyMilestoneKeyPoints, type LegacyMilestoneCycle } from "./legacy-milestone-key-points";

function cycle(partial: Partial<LegacyMilestoneCycle> & Pick<LegacyMilestoneCycle, "id" | "stableKey">): LegacyMilestoneCycle {
  return {
    departmentId: "dietary",
    mealType: "BREAKFAST",
    nodeKind: "PERIOD",
    status: "PUBLISHED",
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    ...partial,
  };
}

test("a breakfast Cycle gains Ready and Service Started Key Points", () => {
  const plan = planLegacyMilestoneKeyPoints({
    cycles: [cycle({ id: "b", stableKey: "breakfast" })],
    occupiedStableKeysByDepartment: new Map(),
  });
  assert.deepEqual(
    plan.creates.map((row) => row.plan.stableKey),
    ["breakfast_due", "breakfast_ready", "breakfast_service_started"],
  );
  assert.deepEqual(plan.clearCycleIds, ["b"]);
  assert.equal(plan.creates[1]?.plan.occurrenceTracking, "REQUIRED");
  assert.equal(plan.creates[1]?.parentStableKey, "breakfast");
});

test("an existing Key Point is not created again", () => {
  const plan = planLegacyMilestoneKeyPoints({
    cycles: [cycle({ id: "b", stableKey: "breakfast" })],
    occupiedStableKeysByDepartment: new Map([["dietary", ["breakfast_ready"]]]),
  });
  assert.deepEqual(
    plan.creates.map((row) => row.plan.stableKey),
    ["breakfast_due", "breakfast_service_started"],
  );
  assert.deepEqual(plan.clearCycleIds, ["b"]);
});

test("a Cycle with no meal name stays unmapped", () => {
  const plan = planLegacyMilestoneKeyPoints({
    cycles: [cycle({ id: "x", stableKey: "evening_service", mealType: null })],
    occupiedStableKeysByDepartment: new Map(),
  });
  assert.deepEqual(plan.creates, []);
  assert.deepEqual(plan.clearCycleIds, []);
  assert.deepEqual(plan.unmappedCycleIds, ["x"]);
});

test("a renamed meal Cycle still uses the meal's Key Point names", () => {
  const plan = planLegacyMilestoneKeyPoints({
    cycles: [cycle({ id: "m", stableKey: "morning_meal", mealType: "BREAKFAST" })],
    occupiedStableKeysByDepartment: new Map(),
  });
  assert.equal(plan.creates[0]?.parentStableKey, "morning_meal");
  assert.equal(plan.creates[1]?.plan.stableKey, "breakfast_ready");
});
