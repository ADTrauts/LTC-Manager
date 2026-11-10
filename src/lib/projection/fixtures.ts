/**
 * Golden location snapshots for Projection tests.
 * Rooms are actionable because Facility responsibility includes them.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";

import type {
  ProjectionAccessClass,
  ProjectionDescriptor,
  ProjectionIdentity,
  ProjectionLens,
  ProjectionLocationNode,
  ProjectionLocationReference,
  ProjectionPlantPolicy,
  ProjectionPurpose,
  ProjectionRequest,
  ProjectionRevision,
  ProjectionSnapshot,
} from "./types";

const FACILITY_ID = "facility_maplewood";
const FLOOR_ID = "unit_ground_floor";
const NEIGHBORHOOD_ID = "unit_kensington";
const SERVERY_SPACE_ID = "space_kensington_servery";
const RESIDENT_ROOM_SPACE_ID = "space_resident_101";
const MECHANICAL_SPACE_ID = "space_mechanical_1";

const REVISION: ProjectionRevision = {
  hierarchyRevision: "hierarchy:15b-fixture",
  assignmentRevision: "assignments:15b-fixture",
  policyRevision: "policy:15b-fixture",
  accessClassRevision: "access:manager-all",
};

const ACCESS_ALL: ProjectionAccessClass = {
  key: "manager-all-units",
  principalKind: "USER",
  role: "MANAGER",
  allowedUnitIds: "ALL",
  permissionKeys: ["*"],
};

const ACCESS_PIN_SERVERY: ProjectionAccessClass = {
  key: "pin-servery-only",
  principalKind: "EMPLOYEE",
  role: "PIN_STAFF",
  allowedUnitIds: [NEIGHBORHOOD_ID],
  lockedUnitId: NEIGHBORHOOD_ID,
  permissionKeys: ["records.read"],
};

function physicalKey(reference: ProjectionLocationReference): string {
  if (reference.kind === "FACILITY") return `facility:${reference.facilityId}`;
  if (reference.kind === "UNIT") return `unit:${reference.unitId}`;
  return `space:${reference.spaceId}`;
}

function descriptor(
  kind: ProjectionDescriptor["kind"],
  sourceId: string,
  label: string,
): ProjectionDescriptor {
  return {
    id: `${kind.toLowerCase()}:${sourceId}`,
    kind,
    sourceId,
    label,
  };
}

function locationTree(actionableSpaceIds: readonly string[]): ProjectionSnapshot["locations"] {
  const room = (
    id: string,
    spaceId: string,
    label: string,
    roomRole: string,
  ): ProjectionLocationNode => ({
    id,
    reference: {
      kind: "SPACE",
      facilityId: FACILITY_ID,
      unitId: NEIGHBORHOOD_ID,
      spaceId,
      roomRole,
    },
    label,
    presentation: actionableSpaceIds.includes(spaceId) ? "ACTIONABLE" : "STRUCTURAL",
    ancestry: ["loc:facility", "loc:ground_floor", "loc:kensington"],
    children: [],
  });

  const actionableRooms = [
    room("loc:servery", SERVERY_SPACE_ID, "Kensington Servery", "servery"),
    room("loc:resident_101", RESIDENT_ROOM_SPACE_ID, "Resident Room 101", "resident_room"),
    room("loc:mechanical", MECHANICAL_SPACE_ID, "Mechanical Room", "mechanical_room"),
  ].filter((node) => node.presentation === "ACTIONABLE");

  const neighborhood: ProjectionLocationNode = {
    id: "loc:kensington",
    reference: {
      kind: "UNIT",
      facilityId: FACILITY_ID,
      unitId: NEIGHBORHOOD_ID,
      hierarchyRole: "NEIGHBORHOOD",
    },
    label: "Kensington",
    presentation: "STRUCTURAL",
    ancestry: ["loc:facility", "loc:ground_floor"],
    children: actionableRooms,
  };
  const floor: ProjectionLocationNode = {
    id: "loc:ground_floor",
    reference: {
      kind: "UNIT",
      facilityId: FACILITY_ID,
      unitId: FLOOR_ID,
      hierarchyRole: "FLOOR",
    },
    label: "Ground Floor",
    presentation: "STRUCTURAL",
    ancestry: ["loc:facility"],
    children: [neighborhood],
  };
  const facility: ProjectionLocationNode = {
    id: "loc:facility",
    reference: { kind: "FACILITY", facilityId: FACILITY_ID },
    label: "Maplewood",
    presentation: "STRUCTURAL",
    ancestry: [],
    children: [floor],
  };

  const byId: Record<string, ProjectionLocationNode> = {};
  const visit = (node: ProjectionLocationNode) => {
    byId[node.id] = node;
    node.children.forEach(visit);
  };
  visit(facility);

  return {
    roots: [facility],
    actionableIds: Object.values(byId)
      .filter((node) => node.presentation === "ACTIONABLE")
      .map((node) => node.id),
    byId,
  };
}

function identity(
  lens: ProjectionLens,
  purpose: ProjectionPurpose,
  accessClass: ProjectionAccessClass,
  focus?: ProjectionLocationReference,
): ProjectionIdentity {
  const lensKey =
    lens.mode === "DEPARTMENT" ? `department:${lens.departmentKey}` : "facility";
  const focusKey = focus ? `:${physicalKey(focus)}` : "";
  return {
    key: `${FACILITY_ID}:${lensKey}:${purpose}:${REVISION.hierarchyRevision}:${accessClass.key}${focusKey}`,
    facilityId: FACILITY_ID,
    lensKey,
    purpose,
    revision: REVISION,
    focus,
  };
}

function request(
  lens: ProjectionLens,
  purpose: ProjectionPurpose,
  accessClass = ACCESS_ALL,
  focus?: ProjectionLocationReference,
): ProjectionRequest {
  return {
    facilityId: FACILITY_ID,
    lens,
    accessClass,
    purpose,
    focus,
    asOf: "2026-07-17T12:00:00.000Z",
  };
}

function snapshotFor(opts: {
  fixtureName: string;
  departmentId: string;
  departmentKey: OperationalDepartmentKey;
  purpose?: ProjectionPurpose;
  accessClass?: ProjectionAccessClass;
  locations: ProjectionSnapshot["locations"];
  plantPolicy?: ProjectionPlantPolicy;
  notes?: readonly string[];
}): ProjectionSnapshot {
  const lens: ProjectionLens = {
    mode: "DEPARTMENT",
    departmentId: opts.departmentId,
    departmentKey: opts.departmentKey,
  };
  const purpose = opts.purpose ?? "UNIT_WORKSPACE";
  const accessClass = opts.accessClass ?? ACCESS_ALL;
  const descriptors = Object.values(opts.locations.byId).map((location) =>
    descriptor("LOCATION", location.id, location.label),
  );
  return {
    context: {
      identity: identity(lens, purpose, accessClass),
      request: request(lens, purpose, accessClass),
      builtAt: "2026-07-17T12:00:00.000Z",
    },
    metadata: {
      architectureWave: "15B",
      fixtureName: opts.fixtureName,
      notes: opts.notes ?? ["Golden fixture; locations come from Facility responsibility."],
    },
    locations: opts.locations,
    descriptors,
    diagnostics: { issues: [] },
    plantPolicy: opts.plantPolicy,
  };
}

const dietaryLocations = locationTree([SERVERY_SPACE_ID]);
const evsLocations = locationTree([RESIDENT_ROOM_SPACE_ID, SERVERY_SPACE_ID]);
const plantLocations = locationTree([
  SERVERY_SPACE_ID,
  RESIDENT_ROOM_SPACE_ID,
  MECHANICAL_SPACE_ID,
]);

export const DIETARY_GOLDEN_PROJECTION: ProjectionSnapshot = snapshotFor({
  fixtureName: "dietary-servery",
  departmentId: "dept_dietary",
  departmentKey: "DIETARY",
  locations: dietaryLocations,
});

export const EVS_GOLDEN_PROJECTION: ProjectionSnapshot = snapshotFor({
  fixtureName: "evs-rooms",
  departmentId: "dept_evs",
  departmentKey: "EVS",
  locations: evsLocations,
});

export const PLANT_GOLDEN_PROJECTION: ProjectionSnapshot = snapshotFor({
  fixtureName: "plant-maintenance",
  departmentId: "dept_plant",
  departmentKey: "PLANT",
  locations: plantLocations,
  plantPolicy: {
    applied: true,
    kind: "PLANT_FACILITY_WIDE_MAINTENANCE",
    createsRoomAssignments: false,
    coveredLocationIds: plantLocations.actionableIds,
  },
});

export const PERMISSION_NARROWED_PROJECTION: ProjectionSnapshot = snapshotFor({
  fixtureName: "permission-narrowed",
  departmentId: "dept_dietary",
  departmentKey: "DIETARY",
  accessClass: ACCESS_PIN_SERVERY,
  locations: dietaryLocations,
});

const facilityLens: ProjectionLens = { mode: "FACILITY" };
const facilityRequest = request(facilityLens, "OPERATIONS_CENTER", ACCESS_ALL);

export const FACILITY_OVERVIEW_GOLDEN_PROJECTION: ProjectionSnapshot = {
  context: {
    identity: identity(facilityLens, "OPERATIONS_CENTER", ACCESS_ALL),
    request: facilityRequest,
    builtAt: "2026-07-17T12:00:00.000Z",
  },
  metadata: {
    architectureWave: "15B",
    fixtureName: "facility-overview-labeled-composition",
    notes: ["Facility Overview composes department snapshots without flattening."],
  },
  locations: { roots: [], actionableIds: [], byId: {} },
  descriptors: [],
  diagnostics: { issues: [] },
  facilityOverview: {
    departmentSnapshots: [
      DIETARY_GOLDEN_PROJECTION,
      EVS_GOLDEN_PROJECTION,
      PLANT_GOLDEN_PROJECTION,
    ],
  },
};

export const PROJECTION_GOLDEN_FIXTURES = [
  DIETARY_GOLDEN_PROJECTION,
  EVS_GOLDEN_PROJECTION,
  PLANT_GOLDEN_PROJECTION,
  PERMISSION_NARROWED_PROJECTION,
  FACILITY_OVERVIEW_GOLDEN_PROJECTION,
] as const;
