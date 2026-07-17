/**
 * Projection Runtime Foundation — golden domain fixtures.
 *
 * These are canonical snapshots for tests and later implementation parity.
 * They are hand-authored fixtures, not a Projection pipeline.
 */

import {
  EXPERIENCE_REGISTRY_VERSION,
  requireExperience,
  requireOperationalArea,
} from "@/lib/experiences";
import type { OperationalDepartmentKey } from "@/lib/department-nav";

import type {
  ProjectionAccessClass,
  ProjectionArea,
  ProjectionDescriptor,
  ProjectionExperience,
  ProjectionExperienceProvenance,
  ProjectionIdentity,
  ProjectionLens,
  ProjectionLocationNode,
  ProjectionLocationReference,
  ProjectionPlantPolicy,
  ProjectionPurpose,
  ProjectionQueryScope,
  ProjectionQueryScopes,
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
  profileRevision: "profiles:15b-fixture",
  bindingRevision: "bindings:15b-fixture",
  policyRevision: "policy:15b-fixture",
  experienceRegistryVersion: EXPERIENCE_REGISTRY_VERSION,
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
  permissionKeys: ["experience.MEAL_SERVICE.read", "experience.MEAL_SERVICE.tool.TASKS"],
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

function locationTree(
  experienceKeysBySpace: Record<string, readonly string[]>,
): ProjectionSnapshot["locations"] {
  const servery: ProjectionLocationNode = {
    id: "loc:servery",
    reference: {
      kind: "SPACE",
      facilityId: FACILITY_ID,
      unitId: NEIGHBORHOOD_ID,
      spaceId: SERVERY_SPACE_ID,
      roomRole: "servery",
    },
    label: "Kensington Servery",
    presentation: experienceKeysBySpace[SERVERY_SPACE_ID]?.length
      ? "ACTIONABLE"
      : "STRUCTURAL",
    ancestry: ["loc:facility", "loc:ground_floor", "loc:kensington"],
    experienceKeys: experienceKeysBySpace[SERVERY_SPACE_ID] ?? [],
    children: [],
  };
  const residentRoom: ProjectionLocationNode = {
    id: "loc:resident_101",
    reference: {
      kind: "SPACE",
      facilityId: FACILITY_ID,
      unitId: NEIGHBORHOOD_ID,
      spaceId: RESIDENT_ROOM_SPACE_ID,
      roomRole: "resident_room",
    },
    label: "Resident Room 101",
    presentation: experienceKeysBySpace[RESIDENT_ROOM_SPACE_ID]?.length
      ? "ACTIONABLE"
      : "STRUCTURAL",
    ancestry: ["loc:facility", "loc:ground_floor", "loc:kensington"],
    experienceKeys: experienceKeysBySpace[RESIDENT_ROOM_SPACE_ID] ?? [],
    children: [],
  };
  const mechanical: ProjectionLocationNode = {
    id: "loc:mechanical",
    reference: {
      kind: "SPACE",
      facilityId: FACILITY_ID,
      unitId: NEIGHBORHOOD_ID,
      spaceId: MECHANICAL_SPACE_ID,
      roomRole: "mechanical_room",
    },
    label: "Mechanical Room",
    presentation: experienceKeysBySpace[MECHANICAL_SPACE_ID]?.length
      ? "ACTIONABLE"
      : "STRUCTURAL",
    ancestry: ["loc:facility", "loc:ground_floor", "loc:kensington"],
    experienceKeys: experienceKeysBySpace[MECHANICAL_SPACE_ID] ?? [],
    children: [],
  };

  const actionableRooms = [servery, residentRoom, mechanical].filter(
    (node) => node.presentation === "ACTIONABLE",
  );
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
    experienceKeys: [],
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
    experienceKeys: [],
    children: [neighborhood],
  };
  const facility: ProjectionLocationNode = {
    id: "loc:facility",
    reference: { kind: "FACILITY", facilityId: FACILITY_ID },
    label: "Maplewood",
    presentation: "STRUCTURAL",
    ancestry: [],
    experienceKeys: [],
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
    key: `${FACILITY_ID}:${lensKey}:${purpose}:${REVISION.profileRevision}:${accessClass.key}${focusKey}`,
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

function makeExperience(
  opts: {
    departmentId: string;
    departmentKey: OperationalDepartmentKey;
    areaKey: string;
    experienceKey: string;
    order: number;
    locationIds: readonly string[];
    provenance: readonly ProjectionExperienceProvenance[];
    dependencies?: readonly string[];
  },
): ProjectionExperience {
  const experience = requireExperience(opts.experienceKey);
  const id = `${opts.departmentId}:${opts.experienceKey}`;
  const queryScopeId = `${id}:scope`;
  return {
    id,
    reference: {
      experienceKey: opts.experienceKey,
      areaKey: opts.areaKey,
      departmentId: opts.departmentId,
      departmentKey: opts.departmentKey,
      locationIds: opts.locationIds,
      relatedExperienceKeys: experience.contracts.relationships.relatedExperienceKeys,
      dependencyExperienceKeys: opts.dependencies ?? [],
    },
    label: experience.name,
    order: opts.order,
    configurationByLocation: Object.fromEntries(
      opts.locationIds.map((locationId) => [locationId, null]),
    ),
    archetypeByLocation: Object.fromEntries(
      opts.locationIds.map((locationId) => [locationId, null]),
    ),
    contracts: {
      experienceKey: opts.experienceKey,
      source: "EXPERIENCE_REGISTRY",
      registryVersion: EXPERIENCE_REGISTRY_VERSION,
      contracts: experience.contracts,
    },
    queryScopeId,
    workspace: {
      default: experience.contracts.workspaceContribution,
      unitWorkspace: experience.contracts.unitWorkspaceContribution,
      businessWorkspace: experience.contracts.businessWorkspaceContribution,
      operationsCenter: experience.contracts.operationsCenterContribution,
    },
    navigation: experience.contracts.navigationContribution,
    permissions: {
      readKeys: experience.contracts.permissions.readKeys,
      actionPermissionKeys: experience.contracts.permissions.actionPermissionKeys,
      allowedActionKeys: experience.contracts.actions.map((action) => action.key),
    },
    actions: experience.contracts.actions,
    descriptors: [descriptor("EXPERIENCE", id, experience.name)],
    provenance: opts.provenance,
  };
}

function makeArea(
  departmentId: string,
  departmentKey: OperationalDepartmentKey,
  areaKey: string,
  experienceIds: readonly string[],
): ProjectionArea {
  const area = requireOperationalArea(areaKey);
  return {
    id: `${departmentId}:area:${areaKey}`,
    areaKey,
    departmentId,
    departmentKey,
    label: area.name,
    order: area.order,
    experienceIds,
    descriptors: [descriptor("AREA", `${departmentId}:area:${areaKey}`, area.name)],
  };
}

function queryScopesFor(
  experiences: readonly ProjectionExperience[],
  departmentId: string,
  departmentKey: OperationalDepartmentKey,
): ProjectionQueryScopes {
  const byExperience: Record<string, ProjectionQueryScope> = {};
  const byDomain: Record<string, string[]> = {};

  for (const projected of experiences) {
    const contract = projected.contracts.contracts.queryScope;
    const scope: ProjectionQueryScope = {
      id: projected.queryScopeId,
      experienceKey: projected.reference.experienceKey,
      departmentId,
      departmentKey,
      domains: contract.domains,
      grain: contract.grain,
      unitIds: [NEIGHBORHOOD_ID],
      spaceIds: projected.reference.locationIds
        .map((locationId) => {
          if (locationId === "loc:servery") return SERVERY_SPACE_ID;
          if (locationId === "loc:resident_101") return RESIDENT_ROOM_SPACE_ID;
          if (locationId === "loc:mechanical") return MECHANICAL_SPACE_ID;
          return "";
        })
        .filter(Boolean),
      rules: contract.rules,
    };
    byExperience[projected.id] = scope;
    for (const domain of contract.domains) {
      byDomain[domain] = [...(byDomain[domain] ?? []), scope.id];
    }
  }
  return { byExperience, byDomain };
}

function snapshotFor(opts: {
  fixtureName: string;
  departmentId: string;
  departmentKey: OperationalDepartmentKey;
  purpose?: ProjectionPurpose;
  accessClass?: ProjectionAccessClass;
  areas: readonly { key: string; experiences: readonly ProjectionExperience[] }[];
  locations: ProjectionSnapshot["locations"];
  plantPolicy?: ProjectionPlantPolicy;
}): ProjectionSnapshot {
  const lens: ProjectionLens = {
    mode: "DEPARTMENT",
    departmentId: opts.departmentId,
    departmentKey: opts.departmentKey,
  };
  const purpose = opts.purpose ?? "UNIT_WORKSPACE";
  const accessClass = opts.accessClass ?? ACCESS_ALL;
  const req = request(lens, purpose, accessClass);
  const grants = (required: readonly string[]) =>
    accessClass.permissionKeys.includes("*") ||
    required.every((key) => accessClass.permissionKeys.includes(key));
  const allExperiences = opts.areas
    .flatMap((area) => area.experiences)
    .map((experience) => {
      const actions = experience.actions.filter((action) =>
        grants(action.permissionKeys),
      );
      return {
        ...experience,
        actions,
        permissions: {
          ...experience.permissions,
          allowedActionKeys: actions.map((action) => action.key),
        },
      };
    });
  const experienceById = new Map(
    allExperiences.map((experience) => [experience.id, experience]),
  );
  const areas = opts.areas.map((area) =>
    makeArea(
      opts.departmentId,
      opts.departmentKey,
      area.key,
      area.experiences
        .map((experience) => experienceById.get(experience.id)?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const queryScopes = queryScopesFor(
    allExperiences,
    opts.departmentId,
    opts.departmentKey,
  );
  const descriptors = [
    ...areas.flatMap((area) => area.descriptors),
    ...allExperiences.flatMap((experience) => experience.descriptors),
    ...Object.values(queryScopes.byExperience).map((scope) =>
      descriptor("QUERY_SCOPE", scope.id, scope.experienceKey),
    ),
    ...Object.values(opts.locations.byId).map((location) =>
      descriptor("LOCATION", location.id, location.label),
    ),
  ];

  return {
    context: {
      identity: identity(lens, purpose, accessClass),
      request: req,
      builtAt: "2026-07-17T12:00:00.000Z",
    },
    metadata: {
      architectureWave: "15B",
      registryVersion: EXPERIENCE_REGISTRY_VERSION,
      fixtureName: opts.fixtureName,
      notes: ["Golden fixture; not generated by a Projection pipeline."],
    },
    areas,
    experiences: allExperiences,
    locations: opts.locations,
    queryScopes,
    descriptors,
    diagnostics: { issues: [] },
    plantPolicy: opts.plantPolicy,
  };
}

const dietaryLocations = locationTree({
  [SERVERY_SPACE_ID]: ["MEAL_SERVICE", "TEMPERATURE_MONITORING"],
});

const evsLocations = locationTree({
  [RESIDENT_ROOM_SPACE_ID]: ["ROOM_CLEANING", "ROOM_STATUS"],
  [SERVERY_SPACE_ID]: ["CLEANING"],
});

const plantLocations = locationTree({
  [SERVERY_SPACE_ID]: ["ASSETS", "WORK_ORDERS", "PREVENTIVE_MAINTENANCE"],
  [RESIDENT_ROOM_SPACE_ID]: ["ASSETS", "WORK_ORDERS"],
  [MECHANICAL_SPACE_ID]: ["ASSETS", "PREVENTIVE_MAINTENANCE"],
});

export const DIETARY_GOLDEN_PROJECTION: ProjectionSnapshot = snapshotFor({
  fixtureName: "dietary-servery",
  departmentId: "dept_dietary",
  departmentKey: "DIETARY",
  areas: [
    {
      key: "dietary_service",
      experiences: [
        makeExperience({
          departmentId: "dept_dietary",
          departmentKey: "DIETARY",
          areaKey: "dietary_service",
          experienceKey: "MEAL_SERVICE",
          order: 10,
          locationIds: ["loc:servery"],
          provenance: ["PROFILE", "ARCHETYPE"],
          dependencies: ["TEMPERATURE_MONITORING"],
        }),
      ],
    },
    {
      key: "dietary_food_safety",
      experiences: [
        makeExperience({
          departmentId: "dept_dietary",
          departmentKey: "DIETARY",
          areaKey: "dietary_food_safety",
          experienceKey: "TEMPERATURE_MONITORING",
          order: 20,
          locationIds: ["loc:servery"],
          provenance: ["PROFILE", "ARCHETYPE"],
        }),
      ],
    },
  ],
  locations: dietaryLocations,
});

export const EVS_GOLDEN_PROJECTION: ProjectionSnapshot = snapshotFor({
  fixtureName: "evs-room-status",
  departmentId: "dept_evs",
  departmentKey: "EVS",
  areas: [
    {
      key: "evs_cleaning",
      experiences: [
        makeExperience({
          departmentId: "dept_evs",
          departmentKey: "EVS",
          areaKey: "evs_cleaning",
          experienceKey: "ROOM_CLEANING",
          order: 10,
          locationIds: ["loc:resident_101"],
          provenance: ["PROFILE", "ARCHETYPE"],
        }),
        makeExperience({
          departmentId: "dept_evs",
          departmentKey: "EVS",
          areaKey: "evs_cleaning",
          experienceKey: "CLEANING",
          order: 20,
          locationIds: ["loc:servery"],
          provenance: ["PROFILE", "ARCHETYPE"],
        }),
      ],
    },
    {
      key: "evs_room_status",
      experiences: [
        makeExperience({
          departmentId: "dept_evs",
          departmentKey: "EVS",
          areaKey: "evs_room_status",
          experienceKey: "ROOM_STATUS",
          order: 30,
          locationIds: ["loc:resident_101"],
          provenance: ["PROFILE", "ARCHETYPE"],
        }),
      ],
    },
  ],
  locations: evsLocations,
});

export const PLANT_GOLDEN_PROJECTION: ProjectionSnapshot = snapshotFor({
  fixtureName: "plant-policy-coverage",
  departmentId: "dept_plant",
  departmentKey: "PLANT",
  areas: [
    {
      key: "plant_assets",
      experiences: [
        makeExperience({
          departmentId: "dept_plant",
          departmentKey: "PLANT",
          areaKey: "plant_assets",
          experienceKey: "ASSETS",
          order: 10,
          locationIds: ["loc:servery", "loc:resident_101", "loc:mechanical"],
          provenance: ["PROFILE", "PLANT_POLICY_DEFAULT"],
        }),
      ],
    },
    {
      key: "plant_work_orders",
      experiences: [
        makeExperience({
          departmentId: "dept_plant",
          departmentKey: "PLANT",
          areaKey: "plant_work_orders",
          experienceKey: "WORK_ORDERS",
          order: 20,
          locationIds: ["loc:servery", "loc:resident_101"],
          provenance: ["PROFILE", "PLANT_POLICY_DEFAULT"],
        }),
      ],
    },
    {
      key: "plant_preventive_maintenance",
      experiences: [
        makeExperience({
          departmentId: "dept_plant",
          departmentKey: "PLANT",
          areaKey: "plant_preventive_maintenance",
          experienceKey: "PREVENTIVE_MAINTENANCE",
          order: 30,
          locationIds: ["loc:servery", "loc:mechanical"],
          provenance: ["PROFILE", "ARCHETYPE", "PLANT_POLICY_DEFAULT"],
        }),
      ],
    },
  ],
  locations: plantLocations,
  plantPolicy: {
    applied: true,
    kind: "PLANT_FACILITY_WIDE_MAINTENANCE",
    createsRoomAssignments: false,
    defaultArchetypeKey: "serviceable_space",
    coveredLocationIds: ["loc:servery", "loc:resident_101"],
  },
});

export const PERMISSION_NARROWED_PROJECTION: ProjectionSnapshot = snapshotFor({
  fixtureName: "dietary-pin-permission-narrowed",
  departmentId: "dept_dietary",
  departmentKey: "DIETARY",
  accessClass: ACCESS_PIN_SERVERY,
  purpose: "DEEP_LINK",
  areas: [
    {
      key: "dietary_service",
      experiences: [
        makeExperience({
          departmentId: "dept_dietary",
          departmentKey: "DIETARY",
          areaKey: "dietary_service",
          experienceKey: "MEAL_SERVICE",
          order: 10,
          locationIds: ["loc:servery"],
          provenance: ["PROFILE", "ARCHETYPE"],
        }),
      ],
    },
  ],
  locations: locationTree({
    [SERVERY_SPACE_ID]: ["MEAL_SERVICE"],
  }),
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
    registryVersion: EXPERIENCE_REGISTRY_VERSION,
    fixtureName: "facility-overview-labeled-composition",
    notes: ["Facility Overview composes department snapshots without flattening."],
  },
  areas: [],
  experiences: [],
  locations: { roots: [], actionableIds: [], byId: {} },
  queryScopes: { byExperience: {}, byDomain: {} },
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

