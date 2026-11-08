import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PLANT_FACILITY_WIDE_POLICY,
  policyEligibleExperienceKeys,
} from "./plant-policy";
import { resolveDepartmentRoomProfile } from "./resolve-room-profile";
import {
  archetypeByKey,
  buildBaselineSnapshot,
  buildRoom,
} from "./test-fixtures";

describe("Plant facility-wide policy boundary", () => {
  it("broad Plant policy never creates room assignment rows", () => {
    assert.equal(PLANT_FACILITY_WIDE_POLICY.createsRoomAssignments, false);
    assert.equal(PLANT_FACILITY_WIDE_POLICY.directBindingsTakePrecedence, true);
    assert.equal(
      PLANT_FACILITY_WIDE_POLICY.defaultArchetypeKey,
      "serviceable_space",
    );
  });

  it("policy can only expose Experiences from the Plant profile itself", () => {
    const plant = buildBaselineSnapshot("PLANT", { status: "ACTIVE" });
    const keys = policyEligibleExperienceKeys(plant);
    assert.ok(keys.includes("WORK_ORDERS"));
    assert.ok(keys.includes("PREVENTIVE_MAINTENANCE"));
    // Never another department's Experiences.
    assert.ok(!keys.includes("MEAL_SERVICE"));
    assert.ok(!keys.includes("ROOM_CLEANING"));
  });

  it("policy grants nothing for a non-Plant profile", () => {
    const dietary = buildBaselineSnapshot("DIETARY", { status: "ACTIVE" });
    assert.deepEqual(policyEligibleExperienceKeys(dietary), []);
  });

  it("specialized Plant room archetype resolves correctly via direct binding", () => {
    const plant = buildBaselineSnapshot("PLANT", { status: "ACTIVE" });
    const mechanical = archetypeByKey(plant, "mechanical_room");
    const room = buildRoom({ assignedDepartmentIds: [plant.departmentId] });

    const resolved = resolveDepartmentRoomProfile({
      profile: plant,
      room,
      archetypeBinding: {
        id: "b1",
        unitSpaceId: room.id,
        archetypeId: mechanical.id,
      },
      exceptions: [],
    });

    assert.equal(resolved.archetype?.key, "mechanical_room");
    const keys = resolved.areas.flatMap((a) =>
      a.experiences.map((e) => e.experienceKey),
    );
    assert.deepEqual(
      [...keys].sort(),
      ["ASSETS", "LIFE_SAFETY", "PREVENTIVE_MAINTENANCE", "UTILITIES", "WORK_ORDERS"],
    );
  });
});
