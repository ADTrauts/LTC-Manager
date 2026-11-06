/**
 * Physical Run footprint from Facility Builder responsibility —
 * independent of ACTIVE Operational Profile.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectDepartmentActionableLocations,
  type HierarchyWalkUnit,
} from "@/lib/department-administration/department-locations";
import { FACILITY_VOCABULARY_PROFILES } from "@/lib/facility-builder/facility-vocabulary";
import { EXPERIENCE_REGISTRY_VERSION } from "@/lib/experiences";
import {
  buildAndPruneProjectionLocations,
  normalizeProjectionHierarchy,
  resolveProjection,
  type ProjectionSource,
  type ProjectionSourceDepartment,
} from "@/lib/projection";

import { adaptLocationsViewToSidebar } from "./adapt-sidebar";
import { adaptProjectionToLocationsView } from "./adapt-projection";
import type { LocationsTreeNode } from "./types";

const FACILITY_ID = "facility_physical";
const FLOOR_ID = "unit_floor_1";
const NEIGHBORHOOD_ID = "unit_naval_park";
const SERVERY_ID = "space_naval_park_servery";
const CUSTOM_KITCHEN_ID = "space_main_kitchen";
const EVS_ROOM_ID = "space_resident_room";
const OTHER_FACILITY_ROOM = "space_other_facility";

function walk(nodes: readonly LocationsTreeNode[]): LocationsTreeNode[] {
  const out: LocationsTreeNode[] = [];
  const visit = (node: LocationsTreeNode) => {
    out.push(node);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}

function dietaryDepartment(
  roomIds: readonly string[],
  unitIds: readonly string[] = [],
): ProjectionSourceDepartment {
  return {
    id: "dept_dietary",
    key: "DIETARY",
    label: "Dietary",
    isActive: true,
    activeProfile: null,
    assignedRoomIds: roomIds,
    assignedUnitIds: unitIds,
    archetypeBindings: [],
    roomExceptions: [],
  };
}

function physicalSource(
  department: ProjectionSourceDepartment,
): ProjectionSource {
  const assignedByRoom = new Map<string, string[]>();
  for (const roomId of department.assignedRoomIds) {
    assignedByRoom.set(roomId, [department.id]);
  }
  return {
    request: {
      facilityId: FACILITY_ID,
      lens: {
        mode: "DEPARTMENT",
        departmentId: department.id,
        departmentKey: department.key,
      },
      accessClass: {
        key: "manager-all",
        principalKind: "USER",
        role: "MANAGER",
        allowedUnitIds: "ALL",
        permissionKeys: ["*"],
      },
      purpose: "LOCATIONS",
      asOf: "2026-08-14T12:00:00.000Z",
    },
    facility: { id: FACILITY_ID, label: "Harborview" },
    locations: [
      {
        id: `facility:${FACILITY_ID}`,
        reference: { kind: "FACILITY", facilityId: FACILITY_ID },
        parentId: null,
        label: "Harborview",
        isActive: true,
        isPlaced: true,
        displayOrder: 0,
      },
      {
        id: "loc:ground",
        reference: {
          kind: "UNIT",
          facilityId: FACILITY_ID,
          unitId: "unit_ground",
          hierarchyRole: "FLOOR",
        },
        parentId: `facility:${FACILITY_ID}`,
        label: "Ground",
        isActive: true,
        isPlaced: true,
        displayOrder: 10,
      },
      {
        id: `unit:${FLOOR_ID}`,
        reference: {
          kind: "UNIT",
          facilityId: FACILITY_ID,
          unitId: FLOOR_ID,
          hierarchyRole: "FLOOR",
        },
        parentId: `facility:${FACILITY_ID}`,
        label: "Floor 1",
        isActive: true,
        isPlaced: true,
        displayOrder: 20,
      },
      {
        id: `unit:${NEIGHBORHOOD_ID}`,
        reference: {
          kind: "UNIT",
          facilityId: FACILITY_ID,
          unitId: NEIGHBORHOOD_ID,
          hierarchyRole: "NEIGHBORHOOD",
        },
        parentId: `unit:${FLOOR_ID}`,
        label: "1A – Naval Park",
        isActive: true,
        isPlaced: true,
        displayOrder: 10,
      },
      {
        id: `space:${SERVERY_ID}`,
        reference: {
          kind: "SPACE",
          facilityId: FACILITY_ID,
          unitId: NEIGHBORHOOD_ID,
          spaceId: SERVERY_ID,
          roomRole: "Servery",
        },
        parentId: `unit:${NEIGHBORHOOD_ID}`,
        label: "Naval Park Servery",
        isActive: true,
        isPlaced: true,
        displayOrder: 10,
      },
      {
        id: `space:${CUSTOM_KITCHEN_ID}`,
        reference: {
          kind: "SPACE",
          facilityId: FACILITY_ID,
          unitId: "unit_ground",
          spaceId: CUSTOM_KITCHEN_ID,
          roomRole: "Kitchen",
        },
        parentId: "loc:ground",
        label: "Main Kitchen",
        isActive: true,
        isPlaced: true,
        displayOrder: 5,
      },
      {
        id: `space:${EVS_ROOM_ID}`,
        reference: {
          kind: "SPACE",
          facilityId: FACILITY_ID,
          unitId: NEIGHBORHOOD_ID,
          spaceId: EVS_ROOM_ID,
          roomRole: "Resident Room",
        },
        parentId: `unit:${NEIGHBORHOOD_ID}`,
        label: "Naval Park Resident Rooms",
        isActive: true,
        isPlaced: true,
        displayOrder: 20,
      },
      {
        id: `space:${OTHER_FACILITY_ROOM}`,
        reference: {
          kind: "SPACE",
          facilityId: "facility_other",
          unitId: "unit_other",
          spaceId: OTHER_FACILITY_ROOM,
          roomRole: "Servery",
        },
        parentId: null,
        label: "Other Facility Servery",
        isActive: true,
        isPlaced: true,
        displayOrder: 1,
      },
    ],
    rooms: [
      {
        locationId: `space:${SERVERY_ID}`,
        context: {
          id: SERVERY_ID,
          facilityId: FACILITY_ID,
          isActive: true,
          unitId: NEIGHBORHOOD_ID,
          parentHierarchyRole: "NEIGHBORHOOD",
          assignedDepartmentIds: assignedByRoom.get(SERVERY_ID) ?? [],
        },
      },
      {
        locationId: `space:${CUSTOM_KITCHEN_ID}`,
        context: {
          id: CUSTOM_KITCHEN_ID,
          facilityId: FACILITY_ID,
          isActive: true,
          unitId: "unit_ground",
          parentHierarchyRole: "FLOOR",
          assignedDepartmentIds: assignedByRoom.get(CUSTOM_KITCHEN_ID) ?? [],
        },
      },
      {
        locationId: `space:${EVS_ROOM_ID}`,
        context: {
          id: EVS_ROOM_ID,
          facilityId: FACILITY_ID,
          isActive: true,
          unitId: NEIGHBORHOOD_ID,
          parentHierarchyRole: "NEIGHBORHOOD",
          assignedDepartmentIds: assignedByRoom.get(EVS_ROOM_ID) ?? [],
        },
      },
    ],
    departments: [department],
    policies: [],
    revision: {
      hierarchyRevision: "h1",
      assignmentRevision: "a1",
      profileRevision: "none",
      bindingRevision: "none",
      policyRevision: "none",
      experienceRegistryVersion: EXPERIENCE_REGISTRY_VERSION,
      accessClassRevision: "access",
    },
    resolvedAt: "2026-08-14T12:00:00.000Z",
  };
}

describe("physical responsibility → Run Locations projection", () => {
  it("1–4. room-only responsibility includes structural neighborhood + floor", () => {
    const snapshot = resolveProjection(
      physicalSource(dietaryDepartment([SERVERY_ID, CUSTOM_KITCHEN_ID])),
    );
    assert.deepEqual([...snapshot.locations.actionableIds].sort(), [
      `space:${CUSTOM_KITCHEN_ID}`,
      `space:${SERVERY_ID}`,
    ]);
    assert.equal(
      snapshot.locations.byId[`unit:${NEIGHBORHOOD_ID}`]?.presentation,
      "STRUCTURAL",
    );
    assert.equal(
      snapshot.locations.byId[`unit:${FLOOR_ID}`]?.presentation,
      "STRUCTURAL",
    );
    assert.equal(
      snapshot.locations.byId[`space:${SERVERY_ID}`]?.presentation,
      "ACTIONABLE",
    );
  });

  it("5–6. responsible neighborhood remains actionable; rooms stay opt-in", () => {
    const snapshot = resolveProjection(
      physicalSource(dietaryDepartment([], [NEIGHBORHOOD_ID])),
    );
    assert.deepEqual(snapshot.locations.actionableIds, [
      `unit:${NEIGHBORHOOD_ID}`,
    ]);
    assert.equal(snapshot.locations.byId[`space:${SERVERY_ID}`], undefined);
  });

  it("7–8. custom and standard room types remain visible", () => {
    const snapshot = resolveProjection(
      physicalSource(dietaryDepartment([SERVERY_ID, CUSTOM_KITCHEN_ID])),
    );
    assert.ok(snapshot.locations.byId[`space:${SERVERY_ID}`]);
    assert.ok(snapshot.locations.byId[`space:${CUSTOM_KITCHEN_ID}`]);
  });

  it("9–10. unrelated department and cross-facility rooms excluded", () => {
    const snapshot = resolveProjection(
      physicalSource(dietaryDepartment([SERVERY_ID])),
    );
    assert.equal(snapshot.locations.byId[`space:${EVS_ROOM_ID}`], undefined);
    assert.equal(
      snapshot.locations.byId[`space:${OTHER_FACILITY_ROOM}`],
      undefined,
    );
  });

  it("11. Facility Builder ordering preserved", () => {
    const hierarchy = normalizeProjectionHierarchy(
      physicalSource(dietaryDepartment([SERVERY_ID, CUSTOM_KITCHEN_ID])),
    ).value;
    const locations = buildAndPruneProjectionLocations(
      hierarchy,
      [],
      [`space:${SERVERY_ID}`, `space:${CUSTOM_KITCHEN_ID}`],
    );
    const facility = locations.roots[0];
    assert.deepEqual(
      facility?.children.map((child) => child.label),
      ["Ground", "Floor 1"],
    );
  });

  it("no ACTIVE profile still projects physical locations", () => {
    const snapshot = resolveProjection(
      physicalSource(dietaryDepartment([SERVERY_ID])),
    );
    assert.ok(
      snapshot.diagnostics.issues.some(
        (issue) => issue.code === "MISSING_ACTIVE_PROFILE",
      ),
    );
    assert.ok(snapshot.locations.actionableIds.includes(`space:${SERVERY_ID}`));
    assert.deepEqual(snapshot.experiences, []);
  });

  it("Locations page + Sidebar share the same physical footprint", () => {
    const snapshot = resolveProjection(
      physicalSource(dietaryDepartment([SERVERY_ID, CUSTOM_KITCHEN_ID])),
    );
    const view = adaptProjectionToLocationsView(snapshot);
    const sidebar = adaptLocationsViewToSidebar(
      view,
      FACILITY_VOCABULARY_PROFILES.ltc,
    );
    const viewIds = walk(view.departmentSnapshots[0]!.roots)
      .filter((n) => n.kind !== "FACILITY")
      .map((n) => n.id)
      .sort();
    function walkSidebar(
      nodes: readonly { id: string; children: readonly unknown[] }[],
    ): string[] {
      const out: string[] = [];
      for (const node of nodes) {
        out.push(node.id);
        out.push(
          ...walkSidebar(
            node.children as readonly { id: string; children: readonly unknown[] }[],
          ),
        );
      }
      return out;
    }
    const sidebarIds = walkSidebar(
      sidebar.sections.flatMap((section) => section.nodes),
    ).sort();
    assert.deepEqual(viewIds, sidebarIds);
    assert.ok(viewIds.includes(`space:${SERVERY_ID}`));
    assert.notEqual(sidebarIds.length, 0);
  });

  it("Department Builder actionable set matches Projection actionable rooms", () => {
    const units: HierarchyWalkUnit[] = [
      {
        id: "unit_ground",
        name: "Ground",
        unitType: "OTHER",
        hierarchyRole: "FLOOR",
        parentUnitId: null,
        isActive: true,
        displayOrder: 10,
        departmentResponsibilities: [],
        childSpaces: [
          {
            id: CUSTOM_KITCHEN_ID,
            name: "Main Kitchen",
            isActive: true,
            sortOrder: 5,
            spaceType: "OTHER",
            customTypeLabel: "Kitchen",
            responsibilities: [{ department: { id: "dept_dietary" } }],
          },
        ],
        childUnits: [],
      },
      {
        id: FLOOR_ID,
        name: "Floor 1",
        unitType: "OTHER",
        hierarchyRole: "FLOOR",
        parentUnitId: null,
        isActive: true,
        displayOrder: 20,
        departmentResponsibilities: [],
        childSpaces: [],
        childUnits: [
          {
            id: NEIGHBORHOOD_ID,
            name: "1A – Naval Park",
            unitType: "OTHER",
            hierarchyRole: "NEIGHBORHOOD",
            parentUnitId: FLOOR_ID,
            isActive: true,
            displayOrder: 10,
            departmentResponsibilities: [],
            childSpaces: [
              {
                id: SERVERY_ID,
                name: "Naval Park Servery",
                isActive: true,
                sortOrder: 10,
                spaceType: "SERVICE_AREA",
                customTypeLabel: "Servery",
                responsibilities: [{ department: { id: "dept_dietary" } }],
              },
              {
                id: EVS_ROOM_ID,
                name: "Naval Park Resident Rooms",
                isActive: true,
                sortOrder: 20,
                spaceType: "PATIENT_ROOM",
                responsibilities: [{ department: { id: "dept_evs" } }],
              },
            ],
            childUnits: [],
          },
        ],
      },
    ];

    const builder = collectDepartmentActionableLocations({
      departmentId: "dept_dietary",
      units,
    });
    const builderRoomIds = builder
      .filter((location) => location.kind === "room")
      .map((location) => location.id)
      .sort();

    const snapshot = resolveProjection(
      physicalSource(dietaryDepartment([SERVERY_ID, CUSTOM_KITCHEN_ID])),
    );
    const projectedRoomIds = snapshot.locations.actionableIds
      .filter((id) => id.startsWith("space:"))
      .map((id) => id.replace(/^space:/, ""))
      .sort();

    assert.deepEqual(builderRoomIds, projectedRoomIds);
    assert.deepEqual(builderRoomIds, [CUSTOM_KITCHEN_ID, SERVERY_ID]);
  });
});
