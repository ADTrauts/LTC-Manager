/**
 * Wave 15C — pure Projection Resolution Pipeline.
 *
 * Input is a fully loaded ProjectionSource. No I/O, Prisma, caching, React,
 * homes, AI, tool rendering, or runtime engine data exists here.
 */

import type {
  ProjectionSource,
  ProjectionSourceDepartment,
  ProjectionSourceLocation,
  ProjectionSourcePolicy,
  ProjectionSourceRoom,
} from "./source";
import type {
  ProjectionDescriptor,
  ProjectionDiagnostic,
  ProjectionIdentity,
  ProjectionLocationNode,
  ProjectionSnapshot,
} from "./types";
import { validateProjectionSnapshot } from "./validation";

type StageResult<T> = {
  value: T;
  diagnostics: ProjectionDiagnostic[];
};

export type NormalizedProjectionHierarchy = {
  locations: readonly ProjectionSourceLocation[];
  locationsById: Readonly<Record<string, ProjectionSourceLocation>>;
  roomsById: Readonly<Record<string, ProjectionSourceRoom>>;
  childrenByParentId: Readonly<Record<string, readonly string[]>>;
};

export type ResolvedProjectionLens = {
  departments: readonly ProjectionSourceDepartment[];
  facilityMode: boolean;
};

export type EligibleProjectionRoom = {
  department: ProjectionSourceDepartment;
  room: ProjectionSourceRoom;
  location: ProjectionSourceLocation;
  policy: ProjectionSourcePolicy | null;
  explicitAssignment: boolean;
};

function diagnostic(
  code: ProjectionDiagnostic["code"],
  message: string,
  path?: string,
  severity: ProjectionDiagnostic["severity"] = "ERROR",
): ProjectionDiagnostic {
  return { code, message, path, severity };
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function makeDescriptor(
  kind: ProjectionDescriptor["kind"],
  sourceId: string,
  label: string,
): ProjectionDescriptor {
  return { id: `${kind}:${sourceId}`, kind, sourceId, label };
}

function locationReferenceKey(location: ProjectionSourceLocation): string {
  const reference = location.reference;
  if (reference.kind === "FACILITY") return `facility:${reference.facilityId}`;
  if (reference.kind === "UNIT") return `unit:${reference.unitId}`;
  return `space:${reference.spaceId}`;
}

function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (!value || typeof value !== "object") return value;
  const object = value as object;
  if (visited.has(object) || Object.isFrozen(object)) return value;
  visited.add(object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, visited);
  }
  Object.freeze(object);
  return value;
}

export function normalizeProjectionHierarchy(
  source: ProjectionSource,
): StageResult<NormalizedProjectionHierarchy> {
  const diagnostics: ProjectionDiagnostic[] = [];
  const locationsById: Record<string, ProjectionSourceLocation> = {};
  const roomsById: Record<string, ProjectionSourceRoom> = {};
  const childrenByParentId: Record<string, string[]> = {};

  const locations = [...source.locations].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  for (const location of locations) {
    if (locationsById[location.id]) {
      diagnostics.push(
        diagnostic(
          "DUPLICATE_ID",
          `Duplicate source location id ${location.id}`,
          "source.locations",
        ),
      );
      continue;
    }
    if (location.reference.facilityId !== source.facility.id) {
      diagnostics.push(
        diagnostic(
          "INVALID_LOCATION_REFERENCE",
          `${location.id} belongs to another facility`,
          `source.locations.${location.id}`,
        ),
      );
      continue;
    }
    locationsById[location.id] = location;
  }

  for (const location of Object.values(locationsById)) {
    if (location.parentId && !locationsById[location.parentId]) {
      diagnostics.push(
        diagnostic(
          "INVALID_LOCATION_REFERENCE",
          `${location.id} references missing parent ${location.parentId}`,
          `source.locations.${location.id}.parentId`,
        ),
      );
      continue;
    }
    const parentKey = location.parentId ?? "__ROOT__";
    childrenByParentId[parentKey] = [
      ...(childrenByParentId[parentKey] ?? []),
      location.id,
    ];
  }

  for (const parentKey of Object.keys(childrenByParentId)) {
    childrenByParentId[parentKey] = [...(childrenByParentId[parentKey] ?? [])].sort(
      (a, b) => {
        const left = locationsById[a]!;
        const right = locationsById[b]!;
        return (
          (left.displayOrder ?? 0) - (right.displayOrder ?? 0) ||
          left.label.localeCompare(right.label) ||
          a.localeCompare(b)
        );
      },
    );
  }

  for (const location of Object.values(locationsById)) {
    const seen = new Set<string>();
    let cursor: ProjectionSourceLocation | undefined = location;
    while (cursor?.parentId) {
      if (seen.has(cursor.parentId)) {
        diagnostics.push(
          diagnostic(
            "INVALID_LOCATION_REFERENCE",
            `Hierarchy cycle detected at ${location.id}`,
            `source.locations.${location.id}`,
          ),
        );
        break;
      }
      seen.add(cursor.parentId);
      cursor = locationsById[cursor.parentId];
    }
  }

  for (const sourceRoom of [...source.rooms].sort((a, b) =>
    a.context.id.localeCompare(b.context.id),
  )) {
    if (roomsById[sourceRoom.context.id]) {
      diagnostics.push(
        diagnostic(
          "DUPLICATE_ID",
          `Duplicate source room id ${sourceRoom.context.id}`,
          "source.rooms",
        ),
      );
      continue;
    }
    const location = locationsById[sourceRoom.locationId];
    if (
      !location ||
      location.reference.kind !== "SPACE" ||
      location.reference.spaceId !== sourceRoom.context.id
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_LOCATION_REFERENCE",
          `Room ${sourceRoom.context.id} has invalid location ${sourceRoom.locationId}`,
          `source.rooms.${sourceRoom.context.id}`,
        ),
      );
      continue;
    }
    roomsById[sourceRoom.context.id] = sourceRoom;
  }

  return {
    value: {
      locations: Object.values(locationsById).sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      locationsById,
      roomsById,
      childrenByParentId,
    },
    diagnostics,
  };
}

export function resolveProjectionLens(
  source: ProjectionSource,
): StageResult<ResolvedProjectionLens> {
  const diagnostics: ProjectionDiagnostic[] = [];
  const lens = source.request.lens;
  const activeDepartments = [...source.departments]
    .filter((department) => department.isActive)
    .sort((a, b) => a.key.localeCompare(b.key));

  if (lens.mode === "FACILITY") {
    return {
      value: { departments: activeDepartments, facilityMode: true },
      diagnostics,
    };
  }

  const department = source.departments.find(
    (candidate) =>
      candidate.id === lens.departmentId &&
      candidate.key === lens.departmentKey,
  );
  if (!department) {
    diagnostics.push(
      diagnostic(
        "UNKNOWN_DEPARTMENT",
        `Unknown department lens ${lens.departmentId}/${lens.departmentKey}`,
        "source.request.lens",
      ),
    );
    return {
      value: { departments: [], facilityMode: false },
      diagnostics,
    };
  }
  if (!department.isActive) {
    diagnostics.push(
      diagnostic(
        "INACTIVE_DEPARTMENT",
        `Department ${department.key} is inactive`,
        `source.departments.${department.id}`,
      ),
    );
    return {
      value: { departments: [], facilityMode: false },
      diagnostics,
    };
  }
  return {
    value: { departments: [department], facilityMode: false },
    diagnostics,
  };
}

function policyCoversRoom(
  policy: ProjectionSourcePolicy,
  roomId: string,
): boolean {
  if (policy.excludedRoomIds?.includes(roomId)) return false;
  return !policy.coveredRoomIds || policy.coveredRoomIds.includes(roomId);
}

export function resolveRoomEligibility(
  source: ProjectionSource,
  hierarchy: NormalizedProjectionHierarchy,
  department: ProjectionSourceDepartment,
): StageResult<readonly EligibleProjectionRoom[]> {
  const diagnostics: ProjectionDiagnostic[] = [];
  const eligible: EligibleProjectionRoom[] = [];
  const assignmentSet = new Set(department.assignedRoomIds);
  const policy =
    source.policies.find(
      (candidate) =>
        candidate.departmentId === department.id &&
        candidate.departmentKey === department.key,
    ) ?? null;
  const access = source.request.accessClass;

  for (const room of Object.values(hierarchy.roomsById).sort((a, b) =>
    a.context.id.localeCompare(b.context.id),
  )) {
    const location = hierarchy.locationsById[room.locationId];
    if (
      !location ||
      location.reference.kind !== "SPACE" ||
      !location.isActive ||
      !location.isPlaced ||
      !room.context.isActive ||
      room.context.unitId === null ||
      room.context.parentHierarchyRole === "STAGED"
    ) {
      continue;
    }

    const explicitAssignment =
      assignmentSet.has(room.context.id) &&
      room.context.assignedDepartmentIds.includes(department.id);
    const coveredPolicy =
      policy && policyCoversRoom(policy, room.context.id) ? policy : null;
    if (!explicitAssignment && !coveredPolicy) continue;

    const allowedByUnit =
      access.allowedUnitIds === "ALL" ||
      access.allowedUnitIds.includes(location.reference.unitId);
    const allowedByLock =
      !access.lockedUnitId ||
      access.lockedUnitId === location.reference.unitId;
    if (!allowedByUnit || !allowedByLock) continue;

    eligible.push({
      department,
      room,
      location,
      policy: coveredPolicy,
      explicitAssignment,
    });
  }

  for (const assignedRoomId of assignmentSet) {
    if (!hierarchy.roomsById[assignedRoomId]) {
      diagnostics.push(
        diagnostic(
          "INVALID_LOCATION_REFERENCE",
          `Department ${department.key} assignment references unknown room ${assignedRoomId}`,
          `source.departments.${department.id}.assignedRoomIds`,
        ),
      );
    }
  }

  return { value: eligible, diagnostics };
}

export function resolveUnitEligibility(
  source: ProjectionSource,
  hierarchy: NormalizedProjectionHierarchy,
  department: ProjectionSourceDepartment,
): StageResult<readonly ProjectionSourceLocation[]> {
  const diagnostics: ProjectionDiagnostic[] = [];
  const eligible: ProjectionSourceLocation[] = [];
  const assignmentSet = new Set(department.assignedUnitIds);
  const access = source.request.accessClass;

  for (const location of Object.values(hierarchy.locationsById).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (location.reference.kind !== "UNIT") continue;
    if (!assignmentSet.has(location.reference.unitId)) continue;
    if (!location.isActive || !location.isPlaced) continue;

    const role = location.reference.hierarchyRole;
    if (role === "BUILDING" || role === "FLOOR") continue;
    if (role !== "NEIGHBORHOOD" && role !== "LEGACY") continue;

    const allowedByUnit =
      access.allowedUnitIds === "ALL" ||
      access.allowedUnitIds.includes(location.reference.unitId);
    const allowedByLock =
      !access.lockedUnitId || access.lockedUnitId === location.reference.unitId;
    if (!allowedByUnit || !allowedByLock) continue;

    eligible.push(location);
  }

  for (const assignedUnitId of assignmentSet) {
    const locationId = `unit:${assignedUnitId}`;
    const location = hierarchy.locationsById[locationId];
    if (!location) {
      diagnostics.push(
        diagnostic(
          "INVALID_LOCATION_REFERENCE",
          `Department ${department.key} assignment references unknown unit ${assignedUnitId}`,
          `source.departments.${department.id}.assignedUnitIds`,
        ),
      );
    }
  }

  return { value: eligible, diagnostics };
}

export function buildAndPruneProjectionLocations(
  hierarchy: NormalizedProjectionHierarchy,
  /**
   * Facility Builder responsibility location ids that appear as ACTIONABLE.
   */
  responsibleLocationIds: readonly string[] = [],
): ProjectionSnapshot["locations"] {
  const responsibleSet = new Set(responsibleLocationIds);

  const byId: Record<string, ProjectionLocationNode> = {};
  const buildNode = (
    sourceLocation: ProjectionSourceLocation,
    ancestry: readonly string[],
  ): ProjectionLocationNode | null => {
    const children = (hierarchy.childrenByParentId[sourceLocation.id] ?? [])
      .map((childId) => hierarchy.locationsById[childId])
      .filter((child): child is ProjectionSourceLocation => Boolean(child))
      .map((child) => buildNode(child, [...ancestry, sourceLocation.id]))
      .filter((child): child is ProjectionLocationNode => Boolean(child));
    const explicitlyResponsible = responsibleSet.has(sourceLocation.id);
    const actionable = explicitlyResponsible;
    if (!actionable && children.length === 0) return null;
    const node: ProjectionLocationNode = {
      id: sourceLocation.id,
      reference: sourceLocation.reference,
      label: sourceLocation.label,
      presentation: actionable ? "ACTIONABLE" : "STRUCTURAL",
      ancestry,
      children,
    };
    byId[node.id] = node;
    return node;
  };

  const roots = (hierarchy.childrenByParentId.__ROOT__ ?? [])
    .map((id) => hierarchy.locationsById[id])
    .filter((location): location is ProjectionSourceLocation => Boolean(location))
    .map((location) => buildNode(location, []))
    .filter((node): node is ProjectionLocationNode => Boolean(node));
  return {
    roots,
    actionableIds: Object.values(byId)
      .filter((node) => node.presentation === "ACTIONABLE")
      .map((node) => node.id)
      .sort((a, b) => a.localeCompare(b)),
    byId,
  };
}

function projectionIdentity(source: ProjectionSource): ProjectionIdentity {
  const lensKey =
    source.request.lens.mode === "FACILITY"
      ? "facility"
      : `department:${source.request.lens.departmentId}:${source.request.lens.departmentKey}`;
  const focusKey = source.request.focus
    ? `:${locationReferenceKey({
        id: "focus",
        reference: source.request.focus,
        parentId: null,
        label: "focus",
        isActive: true,
        isPlaced: true,
      })}`
    : "";
  const revision = source.revision;
  return {
    key: [
      source.facility.id,
      lensKey,
      source.request.purpose,
      revision.hierarchyRevision,
      revision.assignmentRevision,
      revision.policyRevision,
      revision.accessClassRevision,
      source.request.accessClass.key,
    ].join(":") + focusKey,
    facilityId: source.facility.id,
    lensKey,
    purpose: source.request.purpose,
    revision,
    focus: source.request.focus,
  };
}

function emptySnapshot(
  source: ProjectionSource,
  diagnostics: readonly ProjectionDiagnostic[],
): ProjectionSnapshot {
  return {
    context: {
      identity: projectionIdentity(source),
      request: source.request,
      builtAt: source.resolvedAt,
    },
    metadata: {
      architectureWave: "15B",
      notes: ["Locations come from Facility responsibility."],
    },
    locations: { roots: [], actionableIds: [], byId: {} },
    descriptors: [],
    diagnostics: { issues: diagnostics },
  };
}

function resolveDepartmentProjection(
  source: ProjectionSource,
  department: ProjectionSourceDepartment,
  hierarchy: NormalizedProjectionHierarchy,
  priorDiagnostics: readonly ProjectionDiagnostic[],
): ProjectionSnapshot {
  const diagnostics = [...priorDiagnostics];

  // Physical footprint always comes from Facility Builder responsibility.
  const eligibilityStage = resolveRoomEligibility(source, hierarchy, department);
  diagnostics.push(...eligibilityStage.diagnostics);
  const unitEligibilityStage = resolveUnitEligibility(
    source,
    hierarchy,
    department,
  );
  diagnostics.push(...unitEligibilityStage.diagnostics);

  const responsibleLocationIds = stableUnique([
    ...eligibilityStage.value.map((room) => room.location.id),
    ...unitEligibilityStage.value.map((location) => location.id),
  ]);

  const locations = buildAndPruneProjectionLocations(
    hierarchy,
    responsibleLocationIds,
  );
  const descriptors = Object.values(locations.byId)
    .map((location) => makeDescriptor("LOCATION", location.id, location.label))
    .sort((a, b) => a.id.localeCompare(b.id));

  const matchingPolicy = source.policies.find(
    (policy) =>
      policy.departmentId === department.id &&
      policy.departmentKey === department.key,
  );
  const snapshot: ProjectionSnapshot = {
    context: {
      identity: projectionIdentity(source),
      request: source.request,
      builtAt: source.resolvedAt,
    },
    metadata: {
      architectureWave: "15B",
      notes: ["Locations come from Facility responsibility."],
    },
    locations,
    descriptors,
    diagnostics: { issues: diagnostics },
    plantPolicy: matchingPolicy
      ? {
          applied: false,
          kind: matchingPolicy.kind,
          createsRoomAssignments: false,
          coveredLocationIds: [],
        }
      : undefined,
  };

  const validationIssues = validateProjectionSnapshot(snapshot);
  if (validationIssues.length > 0) {
    return deepFreeze(
      emptySnapshot(source, [...diagnostics, ...validationIssues]),
    );
  }
  return deepFreeze(snapshot);
}

export function resolveProjection(source: ProjectionSource): ProjectionSnapshot {
  const hierarchyStage = normalizeProjectionHierarchy(source);
  const lensStage = resolveProjectionLens(source);
  const diagnostics = [
    ...hierarchyStage.diagnostics,
    ...lensStage.diagnostics,
  ];
  if (lensStage.value.facilityMode) {
    const departmentSnapshots = lensStage.value.departments.map((department) => {
      const childSource: ProjectionSource = {
        ...source,
        request: {
          ...source.request,
          lens: {
            mode: "DEPARTMENT",
            departmentId: department.id,
            departmentKey: department.key,
          },
        },
      };
      return resolveDepartmentProjection(
        childSource,
        department,
        hierarchyStage.value,
        diagnostics,
      );
    });
    const facilitySnapshot: ProjectionSnapshot = {
      ...emptySnapshot(source, diagnostics),
      facilityOverview: { departmentSnapshots },
    };
    const validationIssues = validateProjectionSnapshot(facilitySnapshot);
    if (validationIssues.length > 0) {
      return deepFreeze(
        emptySnapshot(source, [...diagnostics, ...validationIssues]),
      );
    }
    return deepFreeze(facilitySnapshot);
  }

  const department = lensStage.value.departments[0];
  if (!department) return deepFreeze(emptySnapshot(source, diagnostics));
  return resolveDepartmentProjection(
    source,
    department,
    hierarchyStage.value,
    diagnostics,
  );
}

