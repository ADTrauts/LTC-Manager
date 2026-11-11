import assert from "node:assert/strict";
import test from "node:test";
import { PLANT_FACILITY_WIDE_POLICY } from "./plant-policy";

test("facility-wide Plant maintenance policy does not create room assignments", () => {
  assert.equal(PLANT_FACILITY_WIDE_POLICY.createsRoomAssignments, false);
});
