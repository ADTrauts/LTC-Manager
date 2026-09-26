import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  emptyLocationOverlays,
  resolveEffectiveLocationProgram,
} from "./effective-location-program";
import { groupRoomsByFacilityRoomType, groupRoomsByOperationalType } from "./operational-type";
import {
  areaExperienceId,
  archetypeByKey,
  buildBaselineSnapshot,
  buildRoom,
} from "./test-fixtures";
import type { DepartmentActionableLocation } from "./department-locations";
import type { EffectiveLocationOverlays } from "./effective-location-program";

function roomLocation(
  partial: Partial<DepartmentActionableLocation> & Pick<DepartmentActionableLocation, "id" | "name">,
): DepartmentActionableLocation {
  return {
    kind: "room",
    source: "space_responsibility",
    displayName: partial.name,
    floorName: "Floor 3",
    parentUnitId: "n1",
    parentNeighborhoodName: "Central Terminal",
    parentNeighborhoodId: "n1",
    isActive: true,
    patternKey: null,
    patternLabel: null,
    hasPattern: false,
    hasOverrides: false,
    status: "assigned",
    unitType: null,
    hierarchyRole: null,
    spaceTypeLabel: "Kitchenette",
    roomTypeKey: "kitchen",
    roomTypeLabel: "Kitchenette",
    recommendedPatternKey: null,
    ...partial,
  };
}

function overlaysWithCycle(id: string, label: string): EffectiveLocationOverlays {
  return {
    ...emptyLocationOverlays(),
    coverageExpectations: [],
    cycles: [
      {
        id,
        label,
        provenance: {
          source: "EXPLICIT_APPLICABILITY",
          mechanism: "CYCLE_LOCATION_MODE",
          detail: "EXPLICIT_UNITS via Operational Cycle Builder",
        },
      },
    ],
  };
}

describe("resolveEffectiveLocationProgram", () => {
  it("exposes Coverage Expectations as an inspectable overlay, not coverage state", () => {
    const overlays = emptyLocationOverlays();
    assert.deepEqual(overlays.coverageExpectations, []);
    assert.equal("covered" in overlays, false);
  });


  it("keeps Servery, Retail, and Main Kitchen Experience sets isolated", () => {
    const profile = buildBaselineSnapshot("DIETARY", { status: "DRAFT" });
    const servery = archetypeByKey(profile, "servery");
    const retail = archetypeByKey(profile, "retail");
    const mainKitchen = archetypeByKey(profile, "main_kitchen");

    const serveryRoom = buildRoom({ assignedDepartmentIds: [profile.departmentId] });
    const retailRoom = buildRoom({ assignedDepartmentIds: [profile.departmentId] });
    const kitchenRoom = buildRoom({ assignedDepartmentIds: [profile.departmentId] });

    const serveryProgram = resolveEffectiveLocationProgram({
      asOf: "2026-09-21T12:00:00.000Z",
      department: { id: profile.departmentId, key: "DIETARY", name: "Dietary" },
      location: {
        kind: "SPACE",
        id: serveryRoom.id,
        name: "Servery",
        displayName: "3A Servery",
        floorName: "Floor 3",
        neighborhoodName: "Central Terminal",
        unitId: "n1",
        spaceId: serveryRoom.id,
      },
      responsibility: { assigned: true, source: "space_responsibility" },
      physical: { roomTypeKey: "kitchen", roomTypeLabel: "Kitchenette" },
      profile,
      roomContext: serveryRoom,
      archetypeBinding: {
        id: "b-servery",
        unitSpaceId: serveryRoom.id,
        archetypeId: servery.id,
      },
      exceptions: [],
      overlays: emptyLocationOverlays(),
    });

    const retailProgram = resolveEffectiveLocationProgram({
      asOf: "2026-09-21T12:00:00.000Z",
      department: { id: profile.departmentId, key: "DIETARY", name: "Dietary" },
      location: {
        kind: "SPACE",
        id: retailRoom.id,
        name: "Retail",
        displayName: "Retail Space",
        floorName: "Floor 1",
        neighborhoodName: "Lobby",
        unitId: "n2",
        spaceId: retailRoom.id,
      },
      responsibility: { assigned: true, source: "space_responsibility" },
      physical: { roomTypeKey: "dining_area", roomTypeLabel: "Dining Area" },
      profile,
      roomContext: retailRoom,
      archetypeBinding: {
        id: "b-retail",
        unitSpaceId: retailRoom.id,
        archetypeId: retail.id,
      },
      exceptions: [],
      overlays: emptyLocationOverlays(),
    });

    const kitchenProgram = resolveEffectiveLocationProgram({
      asOf: "2026-09-21T12:00:00.000Z",
      department: { id: profile.departmentId, key: "DIETARY", name: "Dietary" },
      location: {
        kind: "SPACE",
        id: kitchenRoom.id,
        name: "Main Kitchen",
        displayName: "Production Space",
        floorName: "Floor 1",
        neighborhoodName: "Main Kitchen",
        unitId: "n3",
        spaceId: kitchenRoom.id,
      },
      responsibility: { assigned: true, source: "space_responsibility" },
      physical: { roomTypeKey: "production_area", roomTypeLabel: "Production / Work Area" },
      profile,
      roomContext: kitchenRoom,
      archetypeBinding: {
        id: "b-kitchen",
        unitSpaceId: kitchenRoom.id,
        archetypeId: mainKitchen.id,
      },
      exceptions: [],
      overlays: emptyLocationOverlays(),
    });

    assert.equal(serveryProgram.operationalType.key, "servery");
    assert.equal(serveryProgram.operationalType.provenance, "EXPLICIT_ASSIGNMENT");
    assert.equal(retailProgram.operationalType.key, "retail");
    assert.equal(kitchenProgram.operationalType.key, "main_kitchen");

    const serveryKeys = serveryProgram.experiences.map((e) => e.experienceKey);
    const retailKeys = retailProgram.experiences.map((e) => e.experienceKey);
    const kitchenKeys = kitchenProgram.experiences.map((e) => e.experienceKey);

    assert.ok(serveryKeys.includes("TRAY_ACCURACY"));
    assert.ok(!retailKeys.includes("TRAY_ACCURACY"));
    assert.ok(!kitchenKeys.includes("TRAY_ACCURACY"));

    assert.ok(retailKeys.includes("MENUS"));
    assert.ok(!serveryKeys.includes("MENUS"));
    assert.ok(!kitchenKeys.includes("MENUS"));

    assert.ok(kitchenKeys.includes("PRODUCTION"));
    assert.ok(!serveryKeys.includes("PRODUCTION"));
    assert.ok(!retailKeys.includes("PRODUCTION"));

    assert.ok(serveryProgram.experiences.every((e) => e.source === "ARCHETYPE"));
    assert.ok(retailProgram.experiences.every((e) => e.source === "ARCHETYPE"));
    assert.ok(kitchenProgram.experiences.every((e) => e.source === "ARCHETYPE"));

    assert.notEqual(serveryProgram.physical.roomTypeLabel, serveryProgram.operationalType.name);
  });

  it("does not infer Operational Type from physical type or Unit.unitType", () => {
    const profile = buildBaselineSnapshot("DIETARY", { status: "DRAFT" });
    const room = buildRoom({ assignedDepartmentIds: [profile.departmentId] });

    const program = resolveEffectiveLocationProgram({
      asOf: "2026-09-21T12:00:00.000Z",
      department: { id: profile.departmentId, key: "DIETARY", name: "Dietary" },
      location: {
        kind: "SPACE",
        id: room.id,
        name: "3A Servery",
        displayName: "3A Servery",
        floorName: "Floor 3",
        neighborhoodName: "Central Terminal",
        unitId: "n1",
        spaceId: room.id,
      },
      responsibility: { assigned: true, source: "space_responsibility" },
      physical: { roomTypeKey: "kitchen", roomTypeLabel: "Kitchenette" },
      profile,
      roomContext: room,
      archetypeBinding: null,
      exceptions: [],
      overlays: emptyLocationOverlays(),
    });

    assert.equal(program.operationalType.state, "unassigned");
    assert.equal(program.operationalType.provenance, "UNASSIGNED");
    assert.equal(program.operationalType.name, null);
    assert.equal(program.physical.roomTypeLabel, "Kitchenette");
    assert.ok(program.experiences.every((e) => e.source === "PROFILE"));
  });

  it("keeps Experience ROOM_EXCEPTION provenance and lists overlays as explicit applicability", () => {
    const profile = buildBaselineSnapshot("DIETARY", { status: "DRAFT" });
    const servery = archetypeByKey(profile, "servery");
    const room = buildRoom({ assignedDepartmentIds: [profile.departmentId] });
    const nourishmentsId = areaExperienceId(profile, "NOURISHMENTS");

    const program = resolveEffectiveLocationProgram({
      asOf: "2026-09-21T12:00:00.000Z",
      department: { id: profile.departmentId, key: "DIETARY", name: "Dietary" },
      location: {
        kind: "SPACE",
        id: room.id,
        name: "Servery",
        displayName: "3A Servery",
        floorName: "Floor 3",
        neighborhoodName: "Central Terminal",
        unitId: "n1",
        spaceId: room.id,
      },
      responsibility: { assigned: true, source: "space_responsibility" },
      physical: { roomTypeKey: "kitchen", roomTypeLabel: "Kitchenette" },
      profile,
      roomContext: room,
      archetypeBinding: { id: "b1", unitSpaceId: room.id, archetypeId: servery.id },
      exceptions: [
        {
          id: "e1",
          unitSpaceId: room.id,
          areaExperienceId: nourishmentsId,
          mode: "ENABLE",
          configuration: { cartLocation: "B14" },
          reason: "Cart stored here",
        },
      ],
      overlays: overlaysWithCycle("c1", "Breakfast"),
    });

    const nourishments = program.experiences.find((e) => e.experienceKey === "NOURISHMENTS");
    assert.equal(nourishments?.source, "ROOM_EXCEPTION");
    assert.equal(program.overlays.cycles[0]?.label, "Breakfast");
    assert.equal(program.overlays.cycles[0]?.provenance.source, "EXPLICIT_APPLICABILITY");
    assert.equal(program.overlays.teams.length, 0);
  });

  it("does not assign Operational Type on neighborhood UNIT locations in Phase 1", () => {
    const profile = buildBaselineSnapshot("DIETARY");
    const program = resolveEffectiveLocationProgram({
      asOf: "2026-09-21T12:00:00.000Z",
      department: { id: profile.departmentId, key: "DIETARY", name: "Dietary" },
      location: {
        kind: "UNIT",
        id: "n1",
        name: "Central Terminal",
        displayName: "Central Terminal",
        floorName: "Floor 3",
        neighborhoodName: null,
        unitId: "n1",
        spaceId: null,
      },
      responsibility: { assigned: true, source: "unit_responsibility" },
      physical: { roomTypeKey: null, roomTypeLabel: null },
      profile,
      roomContext: null,
      archetypeBinding: null,
      exceptions: [],
      overlays: emptyLocationOverlays(),
    });

    assert.equal(program.operationalType.state, "unassigned");
    assert.deepEqual(program.experiences, []);
  });

  it("returns empty Experiences when the department is not responsible", () => {
    const profile = buildBaselineSnapshot("DIETARY");
    const room = buildRoom({ assignedDepartmentIds: [] });
    const program = resolveEffectiveLocationProgram({
      asOf: "2026-09-21T12:00:00.000Z",
      department: { id: profile.departmentId, key: "DIETARY", name: "Dietary" },
      location: {
        kind: "SPACE",
        id: room.id,
        name: "Other",
        displayName: "Other",
        floorName: null,
        neighborhoodName: null,
        unitId: null,
        spaceId: room.id,
      },
      responsibility: { assigned: false, source: "none" },
      physical: { roomTypeKey: null, roomTypeLabel: null },
      profile,
      roomContext: room,
      archetypeBinding: null,
      exceptions: [],
      overlays: emptyLocationOverlays(),
    });
    assert.deepEqual(program.experiences, []);
    assert.equal(program.responsibility.assigned, false);
  });
});

describe("groupRoomsByOperationalType", () => {
  it("groups rooms without leaking unassigned into a named type", () => {
    const groups = groupRoomsByOperationalType([
      roomLocation({
        id: "s1",
        name: "Servery",
        patternKey: "archetype:servery",
        patternLabel: "Servery",
        hasPattern: true,
      }),
      roomLocation({
        id: "r1",
        name: "Retail",
        patternKey: "archetype:retail",
        patternLabel: "Retail",
        hasPattern: true,
      }),
      roomLocation({ id: "u1", name: "Unmapped" }),
    ]);
    assert.deepEqual(
      groups.map((g) => g.label),
      ["Servery", "Retail", "No role"],
    );
    assert.equal(groups[2]!.rooms[0]!.id, "u1");
  });
});

describe("groupRoomsByFacilityRoomType", () => {
  it("groups rooms by Facility type and parks untyped rooms last", () => {
    const groups = groupRoomsByFacilityRoomType([
      roomLocation({
        id: "s1",
        name: "3A Servery",
        roomTypeKey: "servery",
        roomTypeLabel: "Servery",
      }),
      roomLocation({
        id: "r1",
        name: "Retail",
        roomTypeKey: "retail",
        roomTypeLabel: "Retail",
      }),
      roomLocation({
        id: "u1",
        name: "Unmapped",
        roomTypeKey: null,
        roomTypeLabel: null,
      }),
    ]);
    assert.deepEqual(
      groups.map((g) => g.label),
      ["Servery", "Retail", "No physical type"],
    );
    assert.equal(groups[2]!.rooms[0]!.id, "u1");
  });
});
