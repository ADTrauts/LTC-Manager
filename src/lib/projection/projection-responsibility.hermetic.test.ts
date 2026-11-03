/**
 * Projection locations come from Facility responsibility.
 * A room does not inherit a unit assignment. A unit assignment does not
 * pull in its rooms.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadProjectionSource } from "./load-source";
import { resolveProjection } from "./pipeline";
import {
  DIETARY_GOLDEN_PROJECTION,
  EVS_GOLDEN_PROJECTION,
  FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  PERMISSION_NARROWED_PROJECTION,
  PLANT_GOLDEN_PROJECTION,
  PROJECTION_GOLDEN_FIXTURES,
} from "./fixtures";
import type {
  ProjectionSource,
  ProjectionSourceDepartment,
  ProjectionSourceLocation,
  ProjectionSourceRoom,
} from "./source";
import type { ProjectionRequest } from "./types";
import { validateProjectionSnapshot } from "./validation";

const FACILITY_ID = "fac_projection";
const FLOOR_ID = "unit_floor";
const NEIGHBORHOOD_ID = "unit_kensington";
const SERVERY_ID = "space_servery";
const KITCHEN_ID = "space_kitchen";

function request(departmentId: string): ProjectionRequest {
  return {
    facilityId: FACILITY_ID,
    lens: {
      mode: "DEPARTMENT",
      departmentId,
      departmentKey: "DIETARY",
    },
    accessClass: {
      key: "manager-all",
      principalKind: "USER",
      role: "MANAGER",
      allowedUnitIds: "ALL",
      permissionKeys: ["*"],
    },
    purpose: "LOCATIONS",
    asOf: "2026-11-03T16:00:00.000Z",
  };
}

function location(
  id: string,
  reference: ProjectionSourceLocation["reference"],
  parentId: string | null,
  label: string,
): ProjectionSourceLocation {
  return {
    id,
    reference,
    parentId,
    label,
    isActive: true,
    isPlaced: true,
  };
}

function room(
  spaceId: string,
  unitId: string,
  parentRole: ProjectionSourceRoom["context"]["parentHierarchyRole"],
  departmentIds: readonly string[],
): ProjectionSourceRoom {
  return {
    locationId: `space:${spaceId}`,
    context: {
      id: spaceId,
      facilityId: FACILITY_ID,
      isActive: true,
      unitId,
      parentHierarchyRole: parentRole,
      assignedDepartmentIds: departmentIds,
    },
  };
}

function sourceFor(
  department: ProjectionSourceDepartment,
): ProjectionSource {
  return {
    request: request(department.id),
    facility: { id: FACILITY_ID, label: "Maplewood" },
    locations: [
      location("facility:fac", { kind: "FACILITY", facilityId: FACILITY_ID }, null, "Maplewood"),
      location(
        `unit:${FLOOR_ID}`,
        { kind: "UNIT", facilityId: FACILITY_ID, unitId: FLOOR_ID, hierarchyRole: "FLOOR" },
        "facility:fac",
        "Ground Floor",
      ),
      location(
        `unit:${NEIGHBORHOOD_ID}`,
        {
          kind: "UNIT",
          facilityId: FACILITY_ID,
          unitId: NEIGHBORHOOD_ID,
          hierarchyRole: "NEIGHBORHOOD",
        },
        `unit:${FLOOR_ID}`,
        "Kensington",
      ),
      location(
        `space:${SERVERY_ID}`,
        {
          kind: "SPACE",
          facilityId: FACILITY_ID,
          unitId: NEIGHBORHOOD_ID,
          spaceId: SERVERY_ID,
          roomRole: "servery",
        },
        `unit:${NEIGHBORHOOD_ID}`,
        "Servery",
      ),
      location(
        `space:${KITCHEN_ID}`,
        {
          kind: "SPACE",
          facilityId: FACILITY_ID,
          unitId: NEIGHBORHOOD_ID,
          spaceId: KITCHEN_ID,
          roomRole: "kitchen",
        },
        `unit:${NEIGHBORHOOD_ID}`,
        "Kitchen",
      ),
    ],
    rooms: [
      room(SERVERY_ID, NEIGHBORHOOD_ID, "NEIGHBORHOOD", department.assignedRoomIds.includes(SERVERY_ID) ? [department.id] : []),
      room(KITCHEN_ID, NEIGHBORHOOD_ID, "NEIGHBORHOOD", department.assignedRoomIds.includes(KITCHEN_ID) ? [department.id] : []),
    ],
    departments: [department],
    policies: [],
    revision: {
      hierarchyRevision: "h1",
      assignmentRevision: "a1",
      policyRevision: "p1",
      accessClassRevision: "ac1",
    },
    resolvedAt: "2026-11-03T16:00:00.000Z",
  };
}

describe("Projection responsibility", () => {
  it("validates location-only golden fixtures", () => {
    for (const snapshot of PROJECTION_GOLDEN_FIXTURES) {
      assert.deepEqual(validateProjectionSnapshot(snapshot), [], snapshot.metadata.fixtureName);
      assert.equal("experiences" in snapshot, false);
      assert.equal("areas" in snapshot, false);
    }
    assert.deepEqual(DIETARY_GOLDEN_PROJECTION.locations.actionableIds, ["loc:servery"]);
    assert.deepEqual(
      [...EVS_GOLDEN_PROJECTION.locations.actionableIds].sort(),
      ["loc:resident_101", "loc:servery"],
    );
    assert.equal(PLANT_GOLDEN_PROJECTION.plantPolicy?.createsRoomAssignments, false);
    assert.equal(PERMISSION_NARROWED_PROJECTION.context.request.accessClass.lockedUnitId, "unit_kensington");
    assert.equal(FACILITY_OVERVIEW_GOLDEN_PROJECTION.facilityOverview?.departmentSnapshots.length, 3);
  });

  it("keeps a responsible room and its structural ancestors, not the sibling room", () => {
    const snapshot = resolveProjection(
      sourceFor({
        id: "dept_dietary",
        key: "DIETARY",
        label: "Dietary",
        isActive: true,
        assignedRoomIds: [SERVERY_ID],
        assignedUnitIds: [],
      }),
    );
    assert.deepEqual(snapshot.locations.actionableIds, [`space:${SERVERY_ID}`]);
    assert.equal(snapshot.locations.byId[`unit:${NEIGHBORHOOD_ID}`]?.presentation, "STRUCTURAL");
    assert.equal(snapshot.locations.byId[`space:${KITCHEN_ID}`], undefined);
  });

  it("does not pull rooms in from a responsible neighborhood", () => {
    const snapshot = resolveProjection(
      sourceFor({
        id: "dept_dietary",
        key: "DIETARY",
        label: "Dietary",
        isActive: true,
        assignedRoomIds: [],
        assignedUnitIds: [NEIGHBORHOOD_ID],
      }),
    );
    assert.deepEqual(snapshot.locations.actionableIds, [`unit:${NEIGHBORHOOD_ID}`]);
    assert.equal(snapshot.locations.byId[`space:${SERVERY_ID}`], undefined);
    assert.equal(snapshot.locations.byId[`unit:${FLOOR_ID}`]?.presentation, "STRUCTURAL");
  });
});

describe("Projection source adapter", () => {
  it("fails closed for an unknown facility", async () => {
    const result = await loadProjectionSource(request("dept_dietary"), {
      facility: {
        findUnique: async () => null,
      },
    });
    assert.equal(result.source, null);
    assert.equal(result.diagnostics[0]?.code, "SOURCE_INVALID");
  });

  it("loads room responsibility without a department profile", async () => {
    const now = new Date("2026-11-03T16:00:00.000Z");
    const result = await loadProjectionSource(request("dept_dietary"), {
      facility: {
        findUnique: async () =>
          ({
            id: FACILITY_ID,
            displayName: "Maplewood",
            vocabularyProfile: "HEALTHCARE",
            updatedAt: now,
            units: [
              {
                id: NEIGHBORHOOD_ID,
                name: "Kensington",
                isActive: true,
                hierarchyRole: "NEIGHBORHOOD",
                parentUnitId: null,
                displayOrder: 1,
                updatedAt: now,
                departmentResponsibilities: [],
              },
            ],
            unitSpaces: [
              {
                id: SERVERY_ID,
                name: "Servery",
                spaceType: "SERVERY",
                customTypeLabel: null,
                isActive: true,
                unitId: NEIGHBORHOOD_ID,
                parentSpaceId: null,
                sortOrder: 1,
                updatedAt: now,
                unit: { id: NEIGHBORHOOD_ID, hierarchyRole: "NEIGHBORHOOD" },
                responsibilities: [
                  {
                    departmentId: "dept_dietary",
                    updatedAt: now,
                    department: { facilityId: FACILITY_ID },
                  },
                ],
              },
              {
                id: KITCHEN_ID,
                name: "Kitchen",
                spaceType: "KITCHEN",
                customTypeLabel: null,
                isActive: true,
                unitId: NEIGHBORHOOD_ID,
                parentSpaceId: null,
                sortOrder: 2,
                updatedAt: now,
                unit: { id: NEIGHBORHOOD_ID, hierarchyRole: "NEIGHBORHOOD" },
                responsibilities: [],
              },
            ],
            departments: [
              {
                id: "dept_dietary",
                key: "DIETARY",
                name: "Dietary",
                isActive: true,
                updatedAt: now,
              },
            ],
          }) as never,
      },
    });
    assert.ok(result.source);
    const dietary = result.source.departments.find((row) => row.id === "dept_dietary");
    assert.deepEqual(dietary?.assignedRoomIds, [SERVERY_ID]);
    assert.equal(result.source.policies.length, 0);
    const snapshot = resolveProjection(result.source);
    assert.deepEqual(snapshot.locations.actionableIds, [`space:${SERVERY_ID}`]);
  });
});
