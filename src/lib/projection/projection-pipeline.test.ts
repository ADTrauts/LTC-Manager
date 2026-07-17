import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  archetypeByKey,
  areaExperienceId,
  buildBaselineSnapshot,
} from "@/lib/department-administration/test-fixtures";
import type {
  ProfileSnapshot,
  RoomExceptionSnapshot,
} from "@/lib/department-administration";
import { EXPERIENCE_REGISTRY_VERSION } from "@/lib/experiences";

import {
  DIETARY_GOLDEN_PROJECTION,
  EVS_GOLDEN_PROJECTION,
} from "./fixtures";
import {
  normalizeProjectionHierarchy,
  resolveActiveProjectionProfile,
  resolveProjection,
  resolveProjectionLens,
  resolveRoomEligibility,
  resolveRoomProfiles,
} from "./pipeline";
import type {
  ProjectionSource,
  ProjectionSourceDepartment,
  ProjectionSourcePolicy,
} from "./source";
import type {
  ProjectionAccessClass,
  ProjectionLens,
  ProjectionRevision,
} from "./types";
import { validateProjectionSnapshot } from "./validation";

const FACILITY_ID = "facility_maplewood";
const FLOOR_ID = "unit_ground_floor";
const UNIT_ID = "unit_kensington";
const SERVERY_ID = "space_kensington_servery";
const RESIDENT_ID = "space_resident_101";
const MECHANICAL_ID = "space_mechanical_1";

const REVISION: ProjectionRevision = {
  hierarchyRevision: "hierarchy:15c",
  assignmentRevision: "assignments:15c",
  profileRevision: "profiles:15c",
  bindingRevision: "bindings:15c",
  policyRevision: "policy:15c",
  experienceRegistryVersion: EXPERIENCE_REGISTRY_VERSION,
  accessClassRevision: "access:15c",
};

const ACCESS_ALL: ProjectionAccessClass = {
  key: "manager-all",
  principalKind: "USER",
  role: "MANAGER",
  allowedUnitIds: "ALL",
  permissionKeys: ["*"],
};

function activeProfile(
  key: "DIETARY" | "EVS" | "PLANT",
  departmentId: string,
  activeExperienceKeys?: readonly string[],
): ProfileSnapshot {
  const snapshot = buildBaselineSnapshot(key, {
    facilityId: FACILITY_ID,
    departmentId,
    status: "ACTIVE",
  });
  if (!activeExperienceKeys) return snapshot;
  const allowed = new Set(activeExperienceKeys);
  const allowedAreaExperienceIds = new Set<string>();
  const areas = snapshot.areas.map((area) => ({
    ...area,
    experiences: area.experiences.map((experience) => {
      const isActive = allowed.has(experience.experienceKey);
      if (isActive) allowedAreaExperienceIds.add(experience.id);
      return { ...experience, isActive };
    }),
  }));
  return {
    ...snapshot,
    areas,
    archetypes: snapshot.archetypes.map((archetype) => ({
      ...archetype,
      experiences: archetype.experiences.map((experience) => ({
        ...experience,
        isActive:
          experience.isActive &&
          allowedAreaExperienceIds.has(experience.areaExperienceId),
      })),
    })),
  };
}

function department(
  key: "DIETARY" | "EVS" | "PLANT",
  roomIds: readonly string[],
  archetypeKey: string,
  activeExperienceKeys?: readonly string[],
  exceptions: readonly RoomExceptionSnapshot[] = [],
): ProjectionSourceDepartment {
  const id = `dept_${key.toLowerCase()}`;
  const profile = activeProfile(key, id, activeExperienceKeys);
  const archetype = archetypeByKey(profile, archetypeKey);
  return {
    id,
    key,
    label: key,
    isActive: true,
    activeProfile: profile,
    assignedRoomIds: roomIds,
    archetypeBindings: roomIds.map((roomId) => ({
      id: `binding:${id}:${roomId}`,
      unitSpaceId: roomId,
      archetypeId: archetype.id,
    })),
    roomExceptions: exceptions,
  };
}

function sourceFor(options?: {
  lens?: ProjectionLens;
  departments?: readonly ProjectionSourceDepartment[];
  policies?: readonly ProjectionSourcePolicy[];
  access?: ProjectionAccessClass;
}): ProjectionSource {
  const departments =
    options?.departments ??
    [
      department(
        "DIETARY",
        [SERVERY_ID],
        "servery",
        ["MEAL_SERVICE", "TEMPERATURE_MONITORING"],
      ),
    ];
  const assignedByRoom = new Map<string, string[]>();
  for (const dept of departments) {
    for (const roomId of dept.assignedRoomIds) {
      assignedByRoom.set(roomId, [
        ...(assignedByRoom.get(roomId) ?? []),
        dept.id,
      ]);
    }
  }
  const lens =
    options?.lens ??
    ({
      mode: "DEPARTMENT",
      departmentId: departments[0]!.id,
      departmentKey: departments[0]!.key,
    } satisfies ProjectionLens);
  return {
    request: {
      facilityId: FACILITY_ID,
      lens,
      accessClass: options?.access ?? ACCESS_ALL,
      purpose: lens.mode === "FACILITY" ? "OPERATIONS_CENTER" : "UNIT_WORKSPACE",
      asOf: "2026-07-17T12:00:00.000Z",
    },
    facility: { id: FACILITY_ID, label: "Maplewood" },
    locations: [
      {
        id: "loc:resident_101",
        reference: {
          kind: "SPACE",
          facilityId: FACILITY_ID,
          unitId: UNIT_ID,
          spaceId: RESIDENT_ID,
          roomRole: "resident_room",
        },
        parentId: "loc:kensington",
        label: "Resident Room 101",
        isActive: true,
        isPlaced: true,
      },
      {
        id: "loc:facility",
        reference: { kind: "FACILITY", facilityId: FACILITY_ID },
        parentId: null,
        label: "Maplewood",
        isActive: true,
        isPlaced: true,
      },
      {
        id: "loc:mechanical",
        reference: {
          kind: "SPACE",
          facilityId: FACILITY_ID,
          unitId: UNIT_ID,
          spaceId: MECHANICAL_ID,
          roomRole: "mechanical_room",
        },
        parentId: "loc:kensington",
        label: "Mechanical Room",
        isActive: true,
        isPlaced: true,
      },
      {
        id: "loc:ground_floor",
        reference: {
          kind: "UNIT",
          facilityId: FACILITY_ID,
          unitId: FLOOR_ID,
          hierarchyRole: "FLOOR",
        },
        parentId: "loc:facility",
        label: "Ground Floor",
        isActive: true,
        isPlaced: true,
      },
      {
        id: "loc:servery",
        reference: {
          kind: "SPACE",
          facilityId: FACILITY_ID,
          unitId: UNIT_ID,
          spaceId: SERVERY_ID,
          roomRole: "servery",
        },
        parentId: "loc:kensington",
        label: "Kensington Servery",
        isActive: true,
        isPlaced: true,
      },
      {
        id: "loc:kensington",
        reference: {
          kind: "UNIT",
          facilityId: FACILITY_ID,
          unitId: UNIT_ID,
          hierarchyRole: "NEIGHBORHOOD",
        },
        parentId: "loc:ground_floor",
        label: "Kensington",
        isActive: true,
        isPlaced: true,
      },
    ],
    rooms: [
      {
        locationId: "loc:servery",
        context: {
          id: SERVERY_ID,
          facilityId: FACILITY_ID,
          isActive: true,
          unitId: UNIT_ID,
          parentHierarchyRole: "NEIGHBORHOOD",
          assignedDepartmentIds: assignedByRoom.get(SERVERY_ID) ?? [],
        },
      },
      {
        locationId: "loc:resident_101",
        context: {
          id: RESIDENT_ID,
          facilityId: FACILITY_ID,
          isActive: true,
          unitId: UNIT_ID,
          parentHierarchyRole: "NEIGHBORHOOD",
          assignedDepartmentIds: assignedByRoom.get(RESIDENT_ID) ?? [],
        },
      },
      {
        locationId: "loc:mechanical",
        context: {
          id: MECHANICAL_ID,
          facilityId: FACILITY_ID,
          isActive: true,
          unitId: UNIT_ID,
          parentHierarchyRole: "NEIGHBORHOOD",
          assignedDepartmentIds: assignedByRoom.get(MECHANICAL_ID) ?? [],
        },
      },
    ],
    departments,
    policies: options?.policies ?? [],
    revision: REVISION,
    resolvedAt: "2026-07-17T12:00:00.000Z",
  };
}

function experienceKeys(snapshot: ReturnType<typeof resolveProjection>) {
  return snapshot.experiences.map(
    (experience) => experience.reference.experienceKey,
  );
}

describe("Projection pipeline — focused stages", () => {
  it("normalizes hierarchy deterministically and indexes physical identities", () => {
    const source = sourceFor();
    const first = normalizeProjectionHierarchy(source);
    const replay = normalizeProjectionHierarchy({
      ...source,
      locations: [...source.locations].reverse(),
      rooms: [...source.rooms].reverse(),
    });
    assert.deepEqual(first, replay);
    assert.equal(
      first.value.locationsById["loc:servery"]?.reference.kind,
      "SPACE",
    );
    assert.deepEqual(first.diagnostics, []);
  });

  it("resolves department and facility lenses without flattening", () => {
    const source = sourceFor();
    assert.deepEqual(
      resolveProjectionLens(source).value.departments.map((item) => item.key),
      ["DIETARY"],
    );
    const facility = resolveProjectionLens(
      sourceFor({ lens: { mode: "FACILITY" } }),
    );
    assert.equal(facility.value.facilityMode, true);
  });

  it("fails closed when an ACTIVE profile is absent", () => {
    const source = sourceFor();
    const dept = { ...source.departments[0]!, activeProfile: null };
    const result = resolveActiveProjectionProfile(dept);
    assert.equal(result.value, null);
    assert.equal(result.diagnostics[0]?.code, "MISSING_ACTIVE_PROFILE");
  });

  it("intersects room assignment, placement, and principal unit access", () => {
    const source = sourceFor({
      access: {
        ...ACCESS_ALL,
        allowedUnitIds: ["another_unit"],
      },
    });
    const hierarchy = normalizeProjectionHierarchy(source).value;
    const result = resolveRoomEligibility(
      source,
      hierarchy,
      source.departments[0]!,
    );
    assert.deepEqual(result.value, []);
  });

  it("applies sparse DISABLE exceptions after archetype resolution", () => {
    const base = department("DIETARY", [SERVERY_ID], "servery");
    const exception: RoomExceptionSnapshot = {
      id: "exception:disable-temperature",
      unitSpaceId: SERVERY_ID,
      areaExperienceId: areaExperienceId(
        base.activeProfile!,
        "TEMPERATURE_MONITORING",
      ),
      mode: "DISABLE",
      configuration: null,
      reason: "local suppression",
    };
    const dept = { ...base, roomExceptions: [exception] };
    const source = sourceFor({ departments: [dept] });
    assert.equal(
      experienceKeys(resolveProjection(source)).includes(
        "TEMPERATURE_MONITORING",
      ),
      false,
    );
  });

  it("allows a sparse ENABLE exception to replace archetype selection", () => {
    const base = department("DIETARY", [SERVERY_ID], "servery");
    const exception: RoomExceptionSnapshot = {
      id: "exception:enable-production",
      unitSpaceId: SERVERY_ID,
      areaExperienceId: areaExperienceId(base.activeProfile!, "PRODUCTION"),
      mode: "ENABLE",
      configuration: { localMode: "servery" },
      reason: "local production",
    };
    const source = sourceFor({
      departments: [{ ...base, roomExceptions: [exception] }],
    });
    const snapshot = resolveProjection(source);
    const production = snapshot.experiences.find(
      (experience) => experience.reference.experienceKey === "PRODUCTION",
    );
    assert.ok(production);
    assert.deepEqual(production.provenance, ["ROOM_EXCEPTION"]);
    assert.deepEqual(production.configurationByLocation["loc:servery"], {
      localMode: "servery",
    });
  });

  it("honors direct archetype replacement", () => {
    const dept = department(
      "DIETARY",
      [SERVERY_ID],
      "production_kitchen",
    );
    const source = sourceFor({ departments: [dept] });
    const snapshot = resolveProjection(source);
    assert.ok(experienceKeys(snapshot).includes("PRODUCTION"));
    assert.equal(experienceKeys(snapshot).includes("MEAL_SERVICE"), false);
    assert.equal(
      snapshot.experiences[0]?.archetypeByLocation["loc:servery"]?.key,
      "production_kitchen",
    );
  });

  it("reports invalid archetype references and orphan bindings", () => {
    const dept = department("DIETARY", [SERVERY_ID], "servery");
    const broken = {
      ...dept,
      archetypeBindings: [
        {
          id: "binding:orphan",
          unitSpaceId: "missing_room",
          archetypeId: "missing_archetype",
        },
      ],
    };
    const source = sourceFor({ departments: [broken] });
    const hierarchy = normalizeProjectionHierarchy(source).value;
    const eligible = resolveRoomEligibility(source, hierarchy, broken).value;
    const stage = resolveRoomProfiles(
      eligible,
      broken.activeProfile!,
      broken,
      Object.keys(hierarchy.roomsById),
    );
    assert.ok(stage.diagnostics.some((issue) => issue.code === "ORPHAN_BINDING"));
    assert.ok(
      stage.diagnostics.some(
        (issue) => issue.code === "INVALID_ARCHETYPE_REFERENCE",
      ),
    );
  });
});

describe("Projection pipeline — complete resolution", () => {
  it("matches the Dietary golden structure", () => {
    const snapshot = resolveProjection(sourceFor());
    assert.deepEqual(
      snapshot.areas.map((area) => area.areaKey),
      DIETARY_GOLDEN_PROJECTION.areas.map((area) => area.areaKey),
    );
    assert.deepEqual(
      experienceKeys(snapshot),
      experienceKeys(DIETARY_GOLDEN_PROJECTION),
    );
    assert.deepEqual(snapshot.locations.actionableIds, ["loc:servery"]);
    assert.deepEqual(validateProjectionSnapshot(snapshot), []);
  });

  it("resolves EVS room Experiences and prunes empty branches", () => {
    const evs = department(
      "EVS",
      [RESIDENT_ID],
      "occupied_resident_room",
      ["ROOM_CLEANING", "ROOM_STATUS"],
    );
    const snapshot = resolveProjection(sourceFor({ departments: [evs] }));
    assert.deepEqual(
      experienceKeys(snapshot),
      experienceKeys(EVS_GOLDEN_PROJECTION).filter(
        (key) => key !== "CLEANING",
      ),
    );
    assert.equal(snapshot.locations.byId["loc:servery"], undefined);
    assert.ok(snapshot.locations.byId["loc:resident_101"]);
  });

  it("applies Plant facility-wide policy without assignments or fake bindings", () => {
    const plant = department("PLANT", [], "serviceable_space", [
      "WORK_ORDERS",
    ]);
    const profile = plant.activeProfile!;
    const noBindings = { ...plant, archetypeBindings: [] };
    const policy: ProjectionSourcePolicy = {
      kind: "PLANT_FACILITY_WIDE_MAINTENANCE",
      departmentId: plant.id,
      departmentKey: plant.key,
      defaultArchetypeKey: "serviceable_space",
      directBindingsTakePrecedence: true,
      createsRoomAssignments: false,
    };
    const snapshot = resolveProjection(
      sourceFor({ departments: [noBindings], policies: [policy] }),
    );
    assert.deepEqual(
      snapshot.experiences[0]?.reference.locationIds,
      ["loc:mechanical", "loc:resident_101", "loc:servery"],
    );
    assert.deepEqual(snapshot.experiences[0]?.provenance, [
      "PLANT_POLICY_DEFAULT",
    ]);
    assert.equal(snapshot.plantPolicy?.createsRoomAssignments, false);
    assert.deepEqual(noBindings.assignedRoomIds, []);
    assert.deepEqual(noBindings.archetypeBindings, []);
    assert.equal(profile.archetypes.some((item) => item.key === "serviceable_space"), true);
  });

  it("gives direct Plant bindings precedence over the policy default", () => {
    const plant = department("PLANT", [], "serviceable_space");
    const mechanical = archetypeByKey(plant.activeProfile!, "mechanical_room");
    const configured = {
      ...plant,
      archetypeBindings: [
        {
          id: "binding:plant:mechanical",
          unitSpaceId: MECHANICAL_ID,
          archetypeId: mechanical.id,
        },
      ],
    };
    const policy: ProjectionSourcePolicy = {
      kind: "PLANT_FACILITY_WIDE_MAINTENANCE",
      departmentId: plant.id,
      departmentKey: plant.key,
      defaultArchetypeKey: "serviceable_space",
      directBindingsTakePrecedence: true,
      createsRoomAssignments: false,
    };
    const snapshot = resolveProjection(
      sourceFor({ departments: [configured], policies: [policy] }),
    );
    const assets = snapshot.experiences.find(
      (experience) => experience.reference.experienceKey === "ASSETS",
    );
    assert.deepEqual(assets?.reference.locationIds, ["loc:mechanical"]);
    assert.deepEqual(assets?.provenance, ["ARCHETYPE"]);
  });

  it("narrows permissions before Areas, Locations, actions, and scopes emit", () => {
    const access: ProjectionAccessClass = {
      key: "meal-read-only",
      principalKind: "EMPLOYEE",
      role: "STAFF",
      allowedUnitIds: [UNIT_ID],
      lockedUnitId: UNIT_ID,
      permissionKeys: ["experience.MEAL_SERVICE.read"],
    };
    const snapshot = resolveProjection(sourceFor({ access }));
    assert.deepEqual(experienceKeys(snapshot), ["MEAL_SERVICE"]);
    assert.deepEqual(
      snapshot.areas.map((area) => area.areaKey),
      ["dietary_service"],
    );
    assert.deepEqual(
      snapshot.experiences[0]?.actions.map((action) => action.key),
      ["meal_service.view_history"],
    );
    assert.deepEqual(Object.keys(snapshot.queryScopes.byExperience), [
      "dept_dietary:MEAL_SERVICE",
    ]);
    assert.deepEqual(snapshot.locations.byId["loc:servery"]?.experienceKeys, [
      "MEAL_SERVICE",
    ]);
  });

  it("suppresses empty Areas after Experience permission filtering", () => {
    const snapshot = resolveProjection(
      sourceFor({
        access: {
          ...ACCESS_ALL,
          permissionKeys: [],
        },
      }),
    );
    assert.deepEqual(snapshot.areas, []);
    assert.deepEqual(snapshot.experiences, []);
    assert.deepEqual(snapshot.locations.roots, []);
  });

  it("preserves labeled Facility Overview department composition", () => {
    const dietary = department(
      "DIETARY",
      [SERVERY_ID],
      "servery",
      ["MEAL_SERVICE"],
    );
    const evs = department(
      "EVS",
      [RESIDENT_ID],
      "occupied_resident_room",
      ["ROOM_CLEANING"],
    );
    const snapshot = resolveProjection(
      sourceFor({
        lens: { mode: "FACILITY" },
        departments: [evs, dietary],
      }),
    );
    assert.deepEqual(snapshot.areas, []);
    assert.deepEqual(snapshot.experiences, []);
    assert.deepEqual(
      snapshot.facilityOverview?.departmentSnapshots.map((child) =>
        child.context.request.lens.mode === "DEPARTMENT"
          ? child.context.request.lens.departmentKey
          : "INVALID",
      ),
      ["DIETARY", "EVS"],
    );
    assert.deepEqual(validateProjectionSnapshot(snapshot), []);
  });

  it("resolves query scopes but never executes runtime data", () => {
    const snapshot = resolveProjection(sourceFor());
    const scope =
      snapshot.queryScopes.byExperience["dept_dietary:MEAL_SERVICE"];
    assert.ok(scope);
    assert.deepEqual(scope.spaceIds, [SERVERY_ID]);
    assert.deepEqual(scope.unitIds, [UNIT_ID]);
    assert.ok(scope.domains.length > 0);
    assert.ok(scope.rules.length > 0);
  });

  it("is deterministic across replay and revision-sensitive", () => {
    const source = sourceFor();
    const first = resolveProjection(source);
    const replay = resolveProjection(structuredClone(source));
    assert.deepEqual(first, replay);
    const changed = resolveProjection({
      ...source,
      revision: { ...source.revision, profileRevision: "profiles:changed" },
    });
    assert.notEqual(
      first.context.identity.key,
      changed.context.identity.key,
    );
  });

  it("deep-freezes snapshots while retaining registry contract references", () => {
    const snapshot = resolveProjection(sourceFor());
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(Object.isFrozen(snapshot.areas), true);
    assert.equal(Object.isFrozen(snapshot.locations.byId), true);
    assert.equal(Object.isFrozen(snapshot.experiences[0]?.contracts.contracts), true);
    assert.throws(() => {
      (snapshot.areas as unknown as unknown[]).push({});
    });
  });
});

