/**
 * Wave 15D — Projection Runtime Service + Source Adapter integration tests.
 *
 * Uses an injectable facility loader (Prisma-shaped) so tests remain pure and
 * do not require a live database. The adapter normalization and 15C pipeline
 * are exercised end-to-end.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  archetypeByKey,
  buildBaselineSnapshot,
} from "@/lib/department-administration/test-fixtures";
import type { ProfileSnapshot } from "@/lib/department-administration";
import { EXPERIENCE_REGISTRY_VERSION } from "@/lib/experiences";

import { loadProjectionSource } from "./load-source";
import {
  createProjectionRuntimeRequestScope,
  formatProjectionRuntimeLog,
  resolveProjectionRuntime,
} from "./runtime";
import {
  buildDepartmentLens,
  buildFacilityLens,
  buildPinAccessPrincipal,
  buildProjectionRequest,
  permissionKeysForRoleBand,
} from "./request";
import type { ProjectionSourceLoadDb } from "./load-source";
import { validateProjectionSnapshot } from "./validation";

const FACILITY_ID = "facility_runtime_1";
const FLOOR_ID = "unit_ground";
const UNIT_ID = "unit_kensington";
const SERVERY_ID = "space_servery";
const RESIDENT_ID = "space_resident_101";
const MECHANICAL_ID = "space_mechanical";
const OTHER_FACILITY_ID = "facility_other";

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

function profileRow(
  snapshot: ProfileSnapshot,
  bindings: { id: string; unitSpaceId: string; archetypeId: string }[],
  exceptions: {
    id: string;
    unitSpaceId: string;
    areaExperienceId: string;
    mode: "ENABLE" | "DISABLE" | "OVERRIDE";
    configurationJson: unknown;
    reason: string | null;
  }[] = [],
) {
  return {
    id: snapshot.id,
    facilityId: snapshot.facilityId,
    departmentId: snapshot.departmentId,
    name: snapshot.name,
    version: snapshot.version,
    status: "ACTIVE" as const,
    baselineKey: snapshot.baselineKey,
    createdByUserId: null,
    certifiedByUserId: null,
    certifiedAt: null,
    activatedAt: new Date("2026-07-01T00:00:00.000Z"),
    retiredAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    department: {
      id: snapshot.departmentId,
      key: snapshot.departmentKey,
      facilityId: snapshot.facilityId,
      isActive: true,
    },
    areas: snapshot.areas.map((area) => ({
      id: area.id,
      profileId: snapshot.id,
      key: area.key,
      name: area.name,
      description: area.description,
      sortOrder: area.sortOrder,
      isActive: area.isActive,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      experiences: area.experiences.map((experience) => ({
        id: experience.id,
        areaId: area.id,
        experienceKey: experience.experienceKey,
        sortOrder: experience.sortOrder,
        isActive: experience.isActive,
        configurationJson: experience.configuration,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      })),
    })),
    archetypes: snapshot.archetypes.map((archetype) => ({
      id: archetype.id,
      profileId: snapshot.id,
      key: archetype.key,
      name: archetype.name,
      description: archetype.description,
      isActive: archetype.isActive,
      sortOrder: archetype.sortOrder,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      experiences: archetype.experiences.map((experience) => ({
        id: experience.id,
        archetypeId: archetype.id,
        areaExperienceId: experience.areaExperienceId,
        isActive: experience.isActive,
        configurationJson: experience.configuration,
        sortOrder: experience.sortOrder,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      })),
    })),
    roomBindings: bindings.map((binding) => ({
      ...binding,
      profileId: snapshot.id,
      createdAt: new Date("2026-07-02T00:00:00.000Z"),
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    })),
    roomExceptions: exceptions.map((exception) => ({
      ...exception,
      profileId: snapshot.id,
      createdAt: new Date("2026-07-03T00:00:00.000Z"),
      updatedAt: new Date("2026-07-03T00:00:00.000Z"),
    })),
  };
}

type FakeFacility = NonNullable<
  Awaited<ReturnType<ProjectionSourceLoadDb["facility"]["findUnique"]>>
>;

function buildFakeFacility(options?: {
  includeDietaryProfile?: boolean;
  includeEvsProfile?: boolean;
  includePlantProfile?: boolean;
  crossFacilityAssignment?: boolean;
  plantBindings?: boolean;
}): FakeFacility {
  const dietaryId = "dept_dietary";
  const evsId = "dept_evs";
  const plantId = "dept_plant";

  const dietary = activeProfile("DIETARY", dietaryId, [
    "MEAL_SERVICE",
    "TEMPERATURE_MONITORING",
  ]);
  const evs = activeProfile("EVS", evsId, ["ROOM_CLEANING", "ROOM_STATUS"]);
  const plant = activeProfile("PLANT", plantId, ["WORK_ORDERS", "ASSETS"]);

  const dietaryArch = archetypeByKey(dietary, "servery");
  const evsArch = archetypeByKey(evs, "occupied_resident_room");
  const plantArch = archetypeByKey(plant, "mechanical_room");

  const departments = [
    {
      id: dietaryId,
      key: "DIETARY",
      name: "Dietary",
      isActive: true,
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      operationalProfiles:
        options?.includeDietaryProfile === false
          ? []
          : [
              profileRow(dietary, [
                {
                  id: "binding_dietary_servery",
                  unitSpaceId: SERVERY_ID,
                  archetypeId: dietaryArch.id,
                },
              ]),
            ],
    },
    {
      id: evsId,
      key: "EVS",
      name: "EVS",
      isActive: true,
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      operationalProfiles:
        options?.includeEvsProfile === false
          ? []
          : [
              profileRow(evs, [
                {
                  id: "binding_evs_resident",
                  unitSpaceId: RESIDENT_ID,
                  archetypeId: evsArch.id,
                },
              ]),
            ],
    },
    {
      id: plantId,
      key: "PLANT",
      name: "Plant",
      isActive: true,
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      operationalProfiles:
        options?.includePlantProfile === false
          ? []
          : [
              profileRow(
                plant,
                options?.plantBindings === false
                  ? []
                  : [
                      {
                        id: "binding_plant_mechanical",
                        unitSpaceId: MECHANICAL_ID,
                        archetypeId: plantArch.id,
                      },
                    ],
              ),
            ],
    },
  ];

  return {
    id: FACILITY_ID,
    displayName: "Maplewood Runtime",
    vocabularyProfile: "ltc",
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    units: [
      {
        id: FLOOR_ID,
        name: "Ground Floor",
        isActive: true,
        hierarchyRole: "FLOOR",
        parentUnitId: null,
        displayOrder: 10,
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
      {
        id: UNIT_ID,
        name: "Kensington",
        isActive: true,
        hierarchyRole: "NEIGHBORHOOD",
        parentUnitId: FLOOR_ID,
        displayOrder: 20,
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
      {
        id: "unit_staged",
        name: "Undesignated",
        isActive: true,
        hierarchyRole: "STAGED",
        parentUnitId: null,
        displayOrder: 90,
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ],
    unitSpaces: [
      {
        id: SERVERY_ID,
        name: "Kensington Servery",
        spaceType: "SERVICE_AREA",
        customTypeLabel: "servery",
        isActive: true,
        unitId: UNIT_ID,
        sortOrder: 10,
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        unit: { id: UNIT_ID, hierarchyRole: "NEIGHBORHOOD" },
        responsibilities: [
          {
            departmentId: dietaryId,
            updatedAt: new Date("2026-07-01T00:00:00.000Z"),
            department: { facilityId: FACILITY_ID },
          },
        ],
      },
      {
        id: RESIDENT_ID,
        name: "Resident Room 101",
        spaceType: "PATIENT_ROOM",
        customTypeLabel: "resident_room",
        isActive: true,
        unitId: UNIT_ID,
        sortOrder: 20,
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        unit: { id: UNIT_ID, hierarchyRole: "NEIGHBORHOOD" },
        responsibilities: [
          {
            departmentId: evsId,
            updatedAt: new Date("2026-07-01T00:00:00.000Z"),
            department: {
              facilityId: options?.crossFacilityAssignment
                ? OTHER_FACILITY_ID
                : FACILITY_ID,
            },
          },
        ],
      },
      {
        id: MECHANICAL_ID,
        name: "Mechanical Room",
        spaceType: "MECHANICAL",
        customTypeLabel: "mechanical_room",
        isActive: true,
        unitId: UNIT_ID,
        sortOrder: 30,
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        unit: { id: UNIT_ID, hierarchyRole: "NEIGHBORHOOD" },
        responsibilities: [],
      },
      {
        id: "space_undesignated",
        name: "Unplaced Room",
        spaceType: "OTHER",
        customTypeLabel: null,
        isActive: true,
        unitId: null,
        sortOrder: 99,
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        unit: null,
        responsibilities: [],
      },
    ],
    departments,
  } as unknown as FakeFacility;
}

function fakeDb(facility: FakeFacility | null): ProjectionSourceLoadDb {
  return {
    facility: {
      findUnique: (async () => facility) as unknown as ProjectionSourceLoadDb["facility"]["findUnique"],
    },
  };
}

function managerRequest(departmentId: string, departmentKey: "DIETARY" | "EVS" | "PLANT") {
  return buildProjectionRequest({
    facilityId: FACILITY_ID,
    lens: buildDepartmentLens(departmentId, departmentKey),
    purpose: "UNIT_WORKSPACE",
    asOf: "2026-07-17T12:00:00.000Z",
    principal: {
      principalKind: "USER",
      role: "MANAGER",
      allowedUnitIds: "ALL",
      permissionKeys: permissionKeysForRoleBand("MANAGER"),
      accessClassKey: "manager-all",
    },
  });
}

describe("Projection request construction", () => {
  it("builds department, facility, and PIN requests", () => {
    const department = buildProjectionRequest({
      facilityId: FACILITY_ID,
      lens: buildDepartmentLens("dept_dietary", "DIETARY"),
      purpose: "SIDEBAR",
      principal: {
        principalKind: "USER",
        role: "SUPERVISOR",
        allowedUnitIds: [UNIT_ID],
        permissionKeys: permissionKeysForRoleBand("SUPERVISOR"),
      },
    });
    assert.equal(department.lens.mode, "DEPARTMENT");
    assert.equal(department.accessClass.allowedUnitIds[0], UNIT_ID);

    const facility = buildProjectionRequest({
      facilityId: FACILITY_ID,
      lens: buildFacilityLens(),
      purpose: "OPERATIONS_CENTER",
      principal: {
        principalKind: "USER",
        role: "GM",
        allowedUnitIds: "ALL",
        permissionKeys: ["*"],
      },
    });
    assert.equal(facility.lens.mode, "FACILITY");

    const pin = buildProjectionRequest({
      facilityId: FACILITY_ID,
      lens: buildDepartmentLens("dept_dietary", "DIETARY"),
      purpose: "DEEP_LINK",
      principal: buildPinAccessPrincipal({
        lockedUnitId: UNIT_ID,
        permissionKeys: ["experience.MEAL_SERVICE.read"],
      }),
    });
    assert.equal(pin.accessClass.lockedUnitId, UNIT_ID);
    assert.deepEqual(pin.accessClass.allowedUnitIds, [UNIT_ID]);
  });
});

describe("Projection Source Adapter", () => {
  it("loads a coordinated ProjectionSource for Dietary", async () => {
    const request = managerRequest("dept_dietary", "DIETARY");
    const loaded = await loadProjectionSource(request, fakeDb(buildFakeFacility()));
    assert.ok(loaded.source);
    assert.equal(loaded.source.facility.id, FACILITY_ID);
    assert.equal(loaded.source.revision.experienceRegistryVersion, EXPERIENCE_REGISTRY_VERSION);
    const dietary = loaded.source.departments.find((d) => d.key === "DIETARY");
    assert.ok(dietary?.activeProfile);
    assert.deepEqual(dietary.assignedRoomIds, [SERVERY_ID]);
    assert.equal(loaded.source.locations.some((l) => l.id === `space:${SERVERY_ID}`), true);
    assert.equal(
      loaded.source.locations.find((l) => l.id === "unit:unit_staged")?.isPlaced,
      false,
    );
  });

  it("fails closed for unknown facility", async () => {
    const request = managerRequest("dept_dietary", "DIETARY");
    const loaded = await loadProjectionSource(request, fakeDb(null));
    assert.equal(loaded.source, null);
    assert.equal(loaded.diagnostics[0]?.code, "SOURCE_INVALID");
  });

  it("diagnoses cross-facility assignments without accepting them", async () => {
    const request = managerRequest("dept_evs", "EVS");
    const loaded = await loadProjectionSource(
      request,
      fakeDb(buildFakeFacility({ crossFacilityAssignment: true })),
    );
    assert.ok(loaded.source);
    assert.ok(
      loaded.diagnostics.some((issue) =>
        issue.message.includes("Cross-facility"),
      ),
    );
    const resident = loaded.source.rooms.find((room) => room.context.id === RESIDENT_ID);
    assert.deepEqual(resident?.context.assignedDepartmentIds, []);
  });

  it("includes Plant policy without fabricating assignments", async () => {
    const request = managerRequest("dept_plant", "PLANT");
    const loaded = await loadProjectionSource(
      request,
      fakeDb(buildFakeFacility({ plantBindings: false })),
    );
    assert.ok(loaded.source);
    const plant = loaded.source.departments.find((d) => d.key === "PLANT");
    assert.deepEqual(plant?.assignedRoomIds, []);
    assert.deepEqual(plant?.archetypeBindings, []);
    assert.equal(loaded.source.policies[0]?.createsRoomAssignments, false);
    assert.equal(loaded.source.policies[0]?.defaultArchetypeKey, "serviceable_space");
  });
});

describe("Projection Runtime Service", () => {
  it("resolves Dietary manager projection through adapter + pipeline", async () => {
    const request = managerRequest("dept_dietary", "DIETARY");
    const result = await resolveProjectionRuntime(request, {
      db: fakeDb(buildFakeFacility()),
    });
    assert.deepEqual(validateProjectionSnapshot(result.snapshot), []);
    assert.deepEqual(
      result.snapshot.experiences.map((e) => e.reference.experienceKey).sort(),
      ["MEAL_SERVICE", "TEMPERATURE_MONITORING"],
    );
    assert.ok(result.metrics.pipelineDurationMs >= 0);
    assert.ok(result.metrics.loadDurationMs >= 0);
    assert.equal(Object.isFrozen(result.snapshot), true);
  });

  it("resolves EVS supervisor and Plant manager lenses", async () => {
    const db = fakeDb(buildFakeFacility());
    const evs = await resolveProjectionRuntime(managerRequest("dept_evs", "EVS"), {
      db,
    });
    assert.ok(
      evs.snapshot.experiences.some(
        (experience) => experience.reference.experienceKey === "ROOM_CLEANING",
      ),
    );

    const plant = await resolveProjectionRuntime(
      managerRequest("dept_plant", "PLANT"),
      { db },
    );
    assert.ok(plant.snapshot.plantPolicy);
    assert.equal(plant.snapshot.plantPolicy?.createsRoomAssignments, false);
    assert.ok(plant.snapshot.experiences.length > 0);
  });

  it("composes Facility Overview without flattening", async () => {
    const request = buildProjectionRequest({
      facilityId: FACILITY_ID,
      lens: buildFacilityLens(),
      purpose: "OPERATIONS_CENTER",
      asOf: "2026-07-17T12:00:00.000Z",
      principal: {
        principalKind: "USER",
        role: "GM",
        allowedUnitIds: "ALL",
        permissionKeys: ["*"],
        accessClassKey: "gm-all",
      },
    });
    const result = await resolveProjectionRuntime(request, {
      db: fakeDb(buildFakeFacility()),
    });
    assert.deepEqual(result.snapshot.areas, []);
    assert.deepEqual(result.snapshot.experiences, []);
    assert.ok(result.snapshot.facilityOverview);
    assert.deepEqual(
      result.snapshot.facilityOverview?.departmentSnapshots.map((child) =>
        child.context.request.lens.mode === "DEPARTMENT"
          ? child.context.request.lens.departmentKey
          : "INVALID",
      ),
      ["DIETARY", "EVS", "PLANT"],
    );
    assert.deepEqual(validateProjectionSnapshot(result.snapshot), []);
  });

  it("fails closed for missing ACTIVE profile", async () => {
    const result = await resolveProjectionRuntime(
      managerRequest("dept_dietary", "DIETARY"),
      {
        db: fakeDb(buildFakeFacility({ includeDietaryProfile: false })),
      },
    );
    assert.deepEqual(result.snapshot.experiences, []);
    assert.ok(
      result.snapshot.diagnostics.issues.some(
        (issue) => issue.code === "MISSING_ACTIVE_PROFILE",
      ),
    );
  });

  it("narrows permissions and pinned units", async () => {
    const request = buildProjectionRequest({
      facilityId: FACILITY_ID,
      lens: buildDepartmentLens("dept_dietary", "DIETARY"),
      purpose: "DEEP_LINK",
      asOf: "2026-07-17T12:00:00.000Z",
      principal: buildPinAccessPrincipal({
        lockedUnitId: UNIT_ID,
        permissionKeys: ["experience.MEAL_SERVICE.read"],
      }),
    });
    const result = await resolveProjectionRuntime(request, {
      db: fakeDb(buildFakeFacility()),
    });
    assert.deepEqual(
      result.snapshot.experiences.map((e) => e.reference.experienceKey),
      ["MEAL_SERVICE"],
    );
    assert.deepEqual(result.snapshot.locations.actionableIds, [
      `space:${SERVERY_ID}`,
    ]);
  });

  it("memoizes identical resolves inside one request scope", async () => {
    const memo = createProjectionRuntimeRequestScope();
    const request = managerRequest("dept_dietary", "DIETARY");
    const db = fakeDb(buildFakeFacility());
    const first = await resolveProjectionRuntime(request, { db, memo });
    const second = await resolveProjectionRuntime(request, { db, memo });
    assert.equal(first, second);
    assert.equal(memo.size(), 1);

    const changed = await resolveProjectionRuntime(
      {
        ...request,
        accessClass: {
          ...request.accessClass,
          key: "manager-all-changed",
        },
      },
      { db, memo },
    );
    assert.notEqual(changed, first);
    assert.equal(memo.size(), 2);
  });

  it("emits structured runtime metrics without analytics payloads", async () => {
    const result = await resolveProjectionRuntime(
      managerRequest("dept_dietary", "DIETARY"),
      { db: fakeDb(buildFakeFacility()) },
    );
    const log = formatProjectionRuntimeLog(result);
    assert.equal(log.event, "projection.runtime.resolve");
    assert.equal(typeof log.loadDurationMs, "number");
    assert.equal(typeof log.pipelineDurationMs, "number");
    assert.equal(typeof log.experienceCount, "number");
    assert.equal("userId" in log, false);
  });

  it("keeps revision tokens stable for identical source loads", async () => {
    const request = managerRequest("dept_dietary", "DIETARY");
    const db = fakeDb(buildFakeFacility());
    const a = await loadProjectionSource(request, db);
    const b = await loadProjectionSource(request, db);
    assert.deepEqual(a.source?.revision, b.source?.revision);
  });

  it("accepts a preloaded ProjectionSource and still invokes the pipeline", async () => {
    const request = managerRequest("dept_dietary", "DIETARY");
    const loaded = await loadProjectionSource(request, fakeDb(buildFakeFacility()));
    assert.ok(loaded.source);
    const result = await resolveProjectionRuntime(request, {
      source: loaded.source,
      sourceDiagnostics: loaded.diagnostics,
      loadDurationMs: loaded.loadDurationMs,
    });
    assert.ok(result.snapshot.experiences.length > 0);
    assert.equal(result.metrics.loadDurationMs, loaded.loadDurationMs);
  });
});
