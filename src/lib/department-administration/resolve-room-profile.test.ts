import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveDepartmentRoomProfile } from "./resolve-room-profile";
import {
  areaExperienceId,
  archetypeByKey,
  buildBaselineSnapshot,
  buildRoom,
} from "./test-fixtures";

describe("room-profile resolution", () => {
  it("resolves profile-only when the room has no archetype binding", () => {
    const profile = buildBaselineSnapshot("DIETARY", { status: "ACTIVE" });
    const room = buildRoom({ assignedDepartmentIds: [profile.departmentId] });

    const resolved = resolveDepartmentRoomProfile({
      profile,
      room,
      archetypeBinding: null,
      exceptions: [],
    });

    assert.equal(resolved.archetype, null);
    assert.ok(resolved.areas.length > 0);
    for (const area of resolved.areas) {
      for (const experience of area.experiences) {
        assert.equal(experience.source, "PROFILE");
      }
    }
    assert.ok(resolved.diagnostics.some((d) => d.code === "room_unmapped"));
  });

  it("archetype narrows Experiences to its selection", () => {
    const profile = buildBaselineSnapshot("DIETARY", { status: "ACTIVE" });
    const servery = archetypeByKey(profile, "servery");
    const room = buildRoom({ assignedDepartmentIds: [profile.departmentId] });

    const resolved = resolveDepartmentRoomProfile({
      profile,
      room,
      archetypeBinding: { id: "b1", unitSpaceId: room.id, archetypeId: servery.id },
      exceptions: [],
    });

    assert.equal(resolved.archetype?.key, "servery");
    const keys = resolved.areas.flatMap((a) =>
      a.experiences.map((e) => e.experienceKey),
    );
    assert.deepEqual(
      [...keys].sort(),
      [
        "CLEANING_LISTS",
        "EQUIPMENT",
        "MEAL_SERVICE",
        "MEAL_TIMES",
        "SANITATION",
        "TEMPERATURE_MONITORING",
        "TRAY_ACCURACY",
      ],
    );
    for (const area of resolved.areas) {
      for (const experience of area.experiences) {
        assert.equal(experience.source, "ARCHETYPE");
      }
    }
  });

  it("archetype configuration merges over profile configuration", () => {
    const profile = buildBaselineSnapshot("DIETARY", { status: "ACTIVE" });
    const servery = archetypeByKey(profile, "servery");
    const mealServiceId = areaExperienceId(profile, "MEAL_SERVICE");

    for (const area of profile.areas) {
      for (const experience of area.experiences) {
        if (experience.id === mealServiceId) {
          experience.configuration = { mealPeriods: ["BREAKFAST", "LUNCH"], style: "plated" };
        }
      }
    }
    for (const selection of servery.experiences) {
      if (selection.areaExperienceId === mealServiceId) {
        selection.configuration = { style: "buffet" };
      }
    }

    const room = buildRoom({ assignedDepartmentIds: [profile.departmentId] });
    const resolved = resolveDepartmentRoomProfile({
      profile,
      room,
      archetypeBinding: { id: "b1", unitSpaceId: room.id, archetypeId: servery.id },
      exceptions: [],
    });

    const meal = resolved.areas
      .flatMap((a) => a.experiences)
      .find((e) => e.experienceKey === "MEAL_SERVICE");
    assert.deepEqual(meal?.effectiveConfiguration, {
      mealPeriods: ["BREAKFAST", "LUNCH"],
      style: "buffet",
    });
  });

  it("room exceptions override archetype selection", () => {
    const profile = buildBaselineSnapshot("DIETARY", { status: "ACTIVE" });
    const servery = archetypeByKey(profile, "servery");
    const room = buildRoom({ assignedDepartmentIds: [profile.departmentId] });

    const nourishmentsId = areaExperienceId(profile, "NOURISHMENTS");
    const mealTimesId = areaExperienceId(profile, "MEAL_TIMES");

    const resolved = resolveDepartmentRoomProfile({
      profile,
      room,
      archetypeBinding: { id: "b1", unitSpaceId: room.id, archetypeId: servery.id },
      exceptions: [
        {
          id: "e1",
          unitSpaceId: room.id,
          areaExperienceId: nourishmentsId,
          mode: "ENABLE",
          configuration: { cartLocation: "B14" },
          reason: "Nourishment cart stored here",
        },
        {
          id: "e2",
          unitSpaceId: room.id,
          areaExperienceId: mealTimesId,
          mode: "DISABLE",
          configuration: null,
          reason: null,
        },
      ],
    });

    const keys = resolved.areas.flatMap((a) =>
      a.experiences.map((e) => e.experienceKey),
    );
    assert.ok(keys.includes("NOURISHMENTS"));
    assert.ok(!keys.includes("MEAL_TIMES"));

    const nourishments = resolved.areas
      .flatMap((a) => a.experiences)
      .find((e) => e.experienceKey === "NOURISHMENTS");
    assert.equal(nourishments?.source, "ROOM_EXCEPTION");
    assert.deepEqual(nourishments?.effectiveConfiguration, {
      cartLocation: "B14",
    });
  });

  it("OVERRIDE exceptions replace configuration without changing selection", () => {
    const profile = buildBaselineSnapshot("DIETARY", { status: "ACTIVE" });
    const servery = archetypeByKey(profile, "servery");
    const room = buildRoom({ assignedDepartmentIds: [profile.departmentId] });
    const mealServiceId = areaExperienceId(profile, "MEAL_SERVICE");

    const resolved = resolveDepartmentRoomProfile({
      profile,
      room,
      archetypeBinding: { id: "b1", unitSpaceId: room.id, archetypeId: servery.id },
      exceptions: [
        {
          id: "e1",
          unitSpaceId: room.id,
          areaExperienceId: mealServiceId,
          mode: "OVERRIDE",
          configuration: { style: "room_service" },
          reason: null,
        },
      ],
    });

    const meal = resolved.areas
      .flatMap((a) => a.experiences)
      .find((e) => e.experienceKey === "MEAL_SERVICE");
    assert.equal(meal?.source, "ROOM_EXCEPTION");
    assert.deepEqual(meal?.effectiveConfiguration, { style: "room_service" });
  });

  it("suppresses empty Areas", () => {
    const profile = buildBaselineSnapshot("DIETARY", { status: "ACTIVE" });
    const office = archetypeByKey(profile, "office_support");
    const room = buildRoom({ assignedDepartmentIds: [profile.departmentId] });

    const resolved = resolveDepartmentRoomProfile({
      profile,
      room,
      archetypeBinding: { id: "b1", unitSpaceId: room.id, archetypeId: office.id },
      exceptions: [],
    });

    // office_support selects only ASSIGNMENTS → only the People area survives.
    assert.deepEqual(resolved.areas.map((a) => a.areaKey), ["dietary_people"]);
    assert.deepEqual(
      resolved.areas[0]!.experiences.map((e) => e.experienceKey),
      ["ASSIGNMENTS"],
    );
  });

  it("preserves stable Area and Experience ordering", () => {
    const profile = buildBaselineSnapshot("DIETARY", { status: "ACTIVE" });
    const room = buildRoom({ assignedDepartmentIds: [profile.departmentId] });

    const resolved = resolveDepartmentRoomProfile({
      profile,
      room,
      archetypeBinding: null,
      exceptions: [],
    });

    const areaOrders = resolved.areas.map((a) => a.sortOrder);
    assert.deepEqual(areaOrders, [...areaOrders].sort((a, b) => a - b));
    for (const area of resolved.areas) {
      const orders = area.experiences.map((e) => e.sortOrder);
      assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
    }
  });

  it("suppresses inactive profile Experiences and refuses to re-enable them", () => {
    const profile = buildBaselineSnapshot("DIETARY", { status: "ACTIVE" });
    const mealServiceId = areaExperienceId(profile, "MEAL_SERVICE");
    for (const area of profile.areas) {
      for (const experience of area.experiences) {
        if (experience.id === mealServiceId) experience.isActive = false;
      }
    }
    const room = buildRoom({ assignedDepartmentIds: [profile.departmentId] });

    const resolved = resolveDepartmentRoomProfile({
      profile,
      room,
      archetypeBinding: null,
      exceptions: [
        {
          id: "e1",
          unitSpaceId: room.id,
          areaExperienceId: mealServiceId,
          mode: "ENABLE",
          configuration: null,
          reason: null,
        },
      ],
    });

    const keys = resolved.areas.flatMap((a) =>
      a.experiences.map((e) => e.experienceKey),
    );
    assert.ok(!keys.includes("MEAL_SERVICE"));
    assert.ok(
      resolved.diagnostics.some(
        (d) => d.code === "exception_on_inactive_experience",
      ),
    );
  });

  it("loads no live data and applies no user access (pure value output)", () => {
    const profile = buildBaselineSnapshot("EVS", { status: "ACTIVE" });
    const room = buildRoom({ assignedDepartmentIds: [profile.departmentId] });
    const resolved = resolveDepartmentRoomProfile({
      profile,
      room,
      archetypeBinding: null,
      exceptions: [],
    });

    // Output contains only profile-derived values — no user, task, log,
    // readiness, or record fields exist on the contract.
    const keys = Object.keys(resolved).sort();
    assert.deepEqual(keys, [
      "archetype",
      "areas",
      "departmentId",
      "diagnostics",
      "profileId",
      "roomId",
    ]);
  });
});
