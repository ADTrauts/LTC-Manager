import assert from "node:assert/strict";
import test from "node:test";

import { deriveAssignedCountsWithOaPreference } from "./oa-staffing-preference";

test("Case A: OA expected+assigned exists for Room -> OA staffing truth used", () => {
  const result = deriveAssignedCountsWithOaPreference({
    operationalEnabled: true,
    spaceAssigned: 1,
    unitAssigned: 0,
    expectedByUnitId: 2,
    scheduleCount: 0,
  });

  assert.deepEqual(result, { assignedCount: 1, expectedCount: 2 });
});

test("Case B: no local OA assignments -> schedule fallback used (expected suppressed)", () => {
  const result = deriveAssignedCountsWithOaPreference({
    operationalEnabled: true,
    spaceAssigned: 0,
    unitAssigned: 0,
    expectedByUnitId: 2,
    scheduleCount: 3,
  });

  assert.deepEqual(result, { assignedCount: 3, expectedCount: null });
});

test("Case C: OA exists elsewhere in Department but not this Room -> schedule fallback used", () => {
  // Simulate: there may be unit-level OA templates (expectedByUnitId) but this location has no
  // local OA assignments (unitAssigned/spaceAssigned both 0).
  const result = deriveAssignedCountsWithOaPreference({
    operationalEnabled: true,
    spaceAssigned: 0,
    unitAssigned: 0,
    expectedByUnitId: 5,
    scheduleCount: 1,
  });

  assert.deepEqual(result, { assignedCount: 1, expectedCount: null });
});

