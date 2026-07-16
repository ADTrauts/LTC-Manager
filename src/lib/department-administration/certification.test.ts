import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateProfileForCertification } from "./certification";
import {
  FACILITY_ID,
  OTHER_FACILITY_ID,
  areaExperienceId,
  archetypeByKey,
  buildBaselineSnapshot,
  buildRoom,
  nextId,
} from "./test-fixtures";

function certify(overrides?: Partial<Parameters<typeof validateProfileForCertification>[0]>) {
  const profile = overrides?.profile ?? buildBaselineSnapshot("DIETARY");
  return validateProfileForCertification({
    profile,
    bindings: [],
    exceptions: [],
    rooms: [],
    facility: { id: profile.facilityId },
    department: {
      id: profile.departmentId,
      facilityId: profile.facilityId,
      isActive: true,
    },
    ...overrides,
  });
}

describe("certification — structural validity", () => {
  it("a valid baseline draft certifies with no errors", () => {
    const result = certify();
    assert.deepEqual(result.errors, []);
    assert.equal(result.certifiable, true);
  });

  it("area order is stable and duplicate area keys are rejected", () => {
    const profile = buildBaselineSnapshot("DIETARY");
    profile.areas[1]!.key = profile.areas[0]!.key;
    const result = certify({ profile });
    assert.ok(result.errors.some((e) => e.code === "duplicate_area_key"));
  });

  it("an Experience active in two Areas is rejected", () => {
    const profile = buildBaselineSnapshot("DIETARY");
    profile.areas[1]!.experiences.push({
      id: nextId("ax"),
      experienceKey: profile.areas[0]!.experiences[0]!.experienceKey,
      sortOrder: 999,
      isActive: true,
      configuration: null,
    });
    const result = certify({ profile });
    assert.ok(result.errors.some((e) => e.code === "experience_multiple_areas"));
  });

  it("unknown Experience keys are rejected", () => {
    const profile = buildBaselineSnapshot("DIETARY");
    profile.areas[0]!.experiences[0]!.experienceKey = "NOT_A_REAL_EXPERIENCE";
    const result = certify({ profile });
    assert.ok(result.errors.some((e) => e.code === "unknown_experience"));
  });

  it("duplicate archetype keys are rejected", () => {
    const profile = buildBaselineSnapshot("DIETARY");
    profile.archetypes[1]!.key = profile.archetypes[0]!.key;
    const result = certify({ profile });
    assert.ok(result.errors.some((e) => e.code === "duplicate_archetype_key"));
  });

  it("archetype referencing an Experience outside the profile is rejected", () => {
    const profile = buildBaselineSnapshot("DIETARY");
    profile.archetypes[0]!.experiences[0]!.areaExperienceId = "not_in_profile";
    const result = certify({ profile });
    assert.ok(
      result.errors.some((e) => e.code === "archetype_experience_out_of_profile"),
    );
  });

  it("unsupported configuration shapes are rejected", () => {
    const profile = buildBaselineSnapshot("DIETARY");
    profile.areas[0]!.experiences[0]!.configuration = {
      nested: { object: true },
    } as never;
    const result = certify({ profile });
    assert.ok(result.errors.some((e) => e.code === "invalid_configuration"));
  });
});

describe("certification — room bindings", () => {
  function bindingSetup() {
    const profile = buildBaselineSnapshot("DIETARY");
    const servery = archetypeByKey(profile, "servery");
    const room = buildRoom({
      assignedDepartmentIds: [profile.departmentId],
    });
    return { profile, servery, room };
  }

  it("a valid assigned room binding certifies", () => {
    const { profile, servery, room } = bindingSetup();
    const result = certify({
      profile,
      bindings: [{ id: "b1", unitSpaceId: room.id, archetypeId: servery.id }],
      rooms: [room],
    });
    assert.deepEqual(result.errors, []);
  });

  it("staged rooms are rejected", () => {
    const { profile, servery } = bindingSetup();
    const staged = buildRoom({
      parentHierarchyRole: "STAGED",
      assignedDepartmentIds: [profile.departmentId],
    });
    const result = certify({
      profile,
      bindings: [{ id: "b1", unitSpaceId: staged.id, archetypeId: servery.id }],
      rooms: [staged],
    });
    assert.ok(result.errors.some((e) => e.code === "binding_staged_room"));
  });

  it("undesignated rooms (unitId null) are rejected", () => {
    const { profile, servery } = bindingSetup();
    const undesignated = buildRoom({
      unitId: null,
      assignedDepartmentIds: [profile.departmentId],
    });
    const result = certify({
      profile,
      bindings: [
        { id: "b1", unitSpaceId: undesignated.id, archetypeId: servery.id },
      ],
      rooms: [undesignated],
    });
    assert.ok(result.errors.some((e) => e.code === "binding_staged_room"));
  });

  it("rooms not assigned to the department are rejected", () => {
    const { profile, servery } = bindingSetup();
    const unassigned = buildRoom({ assignedDepartmentIds: ["another_dept"] });
    const result = certify({
      profile,
      bindings: [
        { id: "b1", unitSpaceId: unassigned.id, archetypeId: servery.id },
      ],
      rooms: [unassigned],
    });
    assert.ok(result.errors.some((e) => e.code === "binding_room_not_assigned"));
  });

  it("cross-facility rooms are rejected", () => {
    const { profile, servery } = bindingSetup();
    const foreign = buildRoom({
      facilityId: OTHER_FACILITY_ID,
      assignedDepartmentIds: [profile.departmentId],
    });
    const result = certify({
      profile,
      bindings: [{ id: "b1", unitSpaceId: foreign.id, archetypeId: servery.id }],
      rooms: [foreign],
    });
    assert.ok(result.errors.some((e) => e.code === "binding_cross_facility"));
  });

  it("one room may bind to at most one archetype per profile", () => {
    const { profile, servery, room } = bindingSetup();
    const kitchen = archetypeByKey(profile, "production_kitchen");
    const result = certify({
      profile,
      bindings: [
        { id: "b1", unitSpaceId: room.id, archetypeId: servery.id },
        { id: "b2", unitSpaceId: room.id, archetypeId: kitchen.id },
      ],
      rooms: [room],
    });
    assert.ok(result.errors.some((e) => e.code === "duplicate_room_binding"));
  });

  it("assigned rooms without archetypes produce diagnostics, not errors", () => {
    const { profile } = bindingSetup();
    const unmapped = buildRoom({
      assignedDepartmentIds: [profile.departmentId],
    });
    const result = certify({ profile, rooms: [unmapped] });
    assert.equal(result.certifiable, true);
    assert.ok(
      result.diagnostics.some((d) => d.code === "assigned_room_unmapped"),
    );
  });

  it("inactive bound rooms produce diagnostics", () => {
    const { profile, servery } = bindingSetup();
    const inactive = buildRoom({
      isActive: false,
      assignedDepartmentIds: [profile.departmentId],
    });
    const result = certify({
      profile,
      bindings: [
        { id: "b1", unitSpaceId: inactive.id, archetypeId: servery.id },
      ],
      rooms: [inactive],
    });
    assert.ok(result.diagnostics.some((d) => d.code === "binding_inactive_room"));
  });
});

describe("certification — sparse exceptions", () => {
  it("exceptions referencing unknown profile Experiences are rejected", () => {
    const profile = buildBaselineSnapshot("DIETARY");
    const room = buildRoom({ assignedDepartmentIds: [profile.departmentId] });
    const result = certify({
      profile,
      exceptions: [
        {
          id: "e1",
          unitSpaceId: room.id,
          areaExperienceId: "not_in_profile",
          mode: "ENABLE",
          configuration: null,
          reason: null,
        },
      ],
      rooms: [room],
    });
    assert.ok(
      result.errors.some((e) => e.code === "exception_unknown_experience"),
    );
  });

  it("repeated identical exceptions diagnose a missing archetype", () => {
    const profile = buildBaselineSnapshot("DIETARY");
    const target = areaExperienceId(profile, "NOURISHMENTS");
    const rooms = [1, 2, 3].map(() =>
      buildRoom({ assignedDepartmentIds: [profile.departmentId] }),
    );
    const result = certify({
      profile,
      exceptions: rooms.map((room, index) => ({
        id: `e${index}`,
        unitSpaceId: room.id,
        areaExperienceId: target,
        mode: "ENABLE" as const,
        configuration: null,
        reason: null,
      })),
      rooms,
    });
    assert.ok(
      result.diagnostics.some(
        (d) => d.code === "exception_pattern_missing_archetype",
      ),
    );
  });

  it("facility/department mismatches are rejected", () => {
    const profile = buildBaselineSnapshot("DIETARY", {
      facilityId: OTHER_FACILITY_ID,
    });
    const result = validateProfileForCertification({
      profile,
      bindings: [],
      exceptions: [],
      rooms: [],
      facility: { id: FACILITY_ID },
      department: {
        id: profile.departmentId,
        facilityId: FACILITY_ID,
        isActive: true,
      },
    });
    assert.ok(result.errors.some((e) => e.code === "profile_facility_mismatch"));
  });

  it("inactive departments are rejected", () => {
    const profile = buildBaselineSnapshot("DIETARY");
    const result = certify({
      profile,
      department: {
        id: profile.departmentId,
        facilityId: profile.facilityId,
        isActive: false,
      },
    });
    assert.ok(result.errors.some((e) => e.code === "department_inactive"));
  });
});
