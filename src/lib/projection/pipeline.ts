/**
 * Wave 15C — pure Projection Resolution Pipeline.
 *
 * Input is a fully loaded ProjectionSource. No I/O, Prisma, caching, React,
 * homes, AI, tool rendering, or runtime engine data exists here.
 */

import {
  EXPERIENCE_REGISTRY_VERSION,
  getExperience,
  getOperationalArea,
  requireOperationalArea,
} from "@/lib/experiences";
import {
  resolveDepartmentRoomProfile,
  type ProfileSnapshot,
  type ResolvedRoomProfile,
} from "@/lib/department-administration";

import type {
  ProjectionSource,
  ProjectionSourceDepartment,
  ProjectionSourceLocation,
  ProjectionSourcePolicy,
  ProjectionSourceRoom,
} from "./source";
import type {
  ProjectionArea,
  ProjectionDescriptor,
  ProjectionDiagnostic,
  ProjectionExperience,
  ProjectionExperienceProvenance,
  ProjectionIdentity,
  ProjectionLocationNode,
  ProjectionQueryScope,
  ProjectionQueryScopes,
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

export type ResolvedProjectionRoom = {
  eligible: EligibleProjectionRoom;
  profile: ProfileSnapshot;
  resolved: ResolvedRoomProfile;
  policyDefaultApplied: boolean;
};

export type PermissionedProjectionRoom = ResolvedProjectionRoom & {
  resolved: ResolvedRoomProfile;
  allowedActionKeysByExperience: Readonly<Record<string, readonly string[]>>;
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

function hasPermission(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  if (granted.includes("*")) return true;
  return required.every((permission) => granted.includes(permission));
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
    ].sort((a, b) => a.localeCompare(b));
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

export function resolveActiveProjectionProfile(
  department: ProjectionSourceDepartment,
): StageResult<ProfileSnapshot | null> {
  if (!department.activeProfile || department.activeProfile.status !== "ACTIVE") {
    return {
      value: null,
      diagnostics: [
        diagnostic(
          "MISSING_ACTIVE_PROFILE",
          `Department ${department.key} has no ACTIVE Operational Profile`,
          `source.departments.${department.id}.activeProfile`,
        ),
      ],
    };
  }
  if (
    department.activeProfile.departmentId !== department.id ||
    department.activeProfile.departmentKey !== department.key
  ) {
    return {
      value: null,
      diagnostics: [
        diagnostic(
          "SOURCE_INVALID",
          `ACTIVE profile does not belong to department ${department.key}`,
          `source.departments.${department.id}.activeProfile`,
        ),
      ],
    };
  }
  return { value: department.activeProfile, diagnostics: [] };
}

export function resolveRoomProfiles(
  eligibleRooms: readonly EligibleProjectionRoom[],
  profile: ProfileSnapshot,
  department: ProjectionSourceDepartment,
  knownSourceRoomIds: readonly string[],
): StageResult<readonly ResolvedProjectionRoom[]> {
  const diagnostics: ProjectionDiagnostic[] = [];
  const resolvedRooms: ResolvedProjectionRoom[] = [];
  const knownRoomIds = new Set(knownSourceRoomIds);
  const knownAreaExperienceIds = new Set(
    profile.areas.flatMap((area) =>
      area.experiences.map((experience) => experience.id),
    ),
  );
  const bindingsByRoom = new Map<
    string,
    ProjectionSourceDepartment["archetypeBindings"][number][]
  >();
  const exceptionsByRoom = new Map<
    string,
    ProjectionSourceDepartment["roomExceptions"][number][]
  >();

  for (const binding of department.archetypeBindings) {
    bindingsByRoom.set(binding.unitSpaceId, [
      ...(bindingsByRoom.get(binding.unitSpaceId) ?? []),
      binding,
    ]);
    if (!knownRoomIds.has(binding.unitSpaceId)) {
      diagnostics.push(
        diagnostic(
          "ORPHAN_BINDING",
          `Binding ${binding.id} references an ineligible or unknown room ${binding.unitSpaceId}`,
          `bindings.${binding.id}`,
        ),
      );
    }
    if (!profile.archetypes.some((archetype) => archetype.id === binding.archetypeId)) {
      diagnostics.push(
        diagnostic(
          "INVALID_ARCHETYPE_REFERENCE",
          `Binding ${binding.id} references unknown archetype ${binding.archetypeId}`,
          `bindings.${binding.id}`,
        ),
      );
    }
  }

  for (const exception of department.roomExceptions) {
    exceptionsByRoom.set(exception.unitSpaceId, [
      ...(exceptionsByRoom.get(exception.unitSpaceId) ?? []),
      exception,
    ]);
    if (
      !knownRoomIds.has(exception.unitSpaceId) ||
      !knownAreaExperienceIds.has(exception.areaExperienceId)
    ) {
      diagnostics.push(
        diagnostic(
          "ROOM_EXCEPTION_INVALID",
          `Room exception ${exception.id} references an invalid room or Experience`,
          `exceptions.${exception.id}`,
        ),
      );
    }
  }

  for (const eligible of eligibleRooms) {
    const bindings =
      bindingsByRoom.get(eligible.room.context.id) ?? [];
    if (bindings.length > 1) {
      diagnostics.push(
        diagnostic(
          "ORPHAN_BINDING",
          `Room ${eligible.room.context.id} has multiple archetype bindings`,
          `rooms.${eligible.room.context.id}`,
        ),
      );
      continue;
    }
    const binding = bindings[0] ?? null;
    const policyDefaultArchetypeKey =
      !binding && eligible.policy
        ? eligible.policy.defaultArchetypeKey
        : undefined;

    if (!binding && !policyDefaultArchetypeKey) {
      diagnostics.push(
        diagnostic(
          "ROOM_UNMAPPED",
          `Room ${eligible.room.context.id} has no archetype mapping`,
          `rooms.${eligible.room.context.id}`,
          "WARNING",
        ),
      );
      continue;
    }

    const resolved = resolveDepartmentRoomProfile({
      profile,
      room: eligible.room.context,
      archetypeBinding: binding,
      policyDefaultArchetypeKey,
      exceptions: exceptionsByRoom.get(eligible.room.context.id) ?? [],
    });
    for (const roomIssue of resolved.diagnostics) {
      const code =
        roomIssue.code.includes("archetype") ||
        roomIssue.code.includes("binding")
          ? "INVALID_ARCHETYPE_REFERENCE"
          : roomIssue.code.includes("exception")
            ? "ROOM_EXCEPTION_INVALID"
            : "SOURCE_INVALID";
      diagnostics.push(
        diagnostic(
          code,
          roomIssue.message,
          `rooms.${eligible.room.context.id}`,
          "WARNING",
        ),
      );
    }
    if (!resolved.archetype) continue;

    resolvedRooms.push({
      eligible,
      profile,
      resolved,
      policyDefaultApplied: Boolean(policyDefaultArchetypeKey),
    });
  }

  return { value: resolvedRooms, diagnostics };
}

export function resolveRegistryContracts(
  rooms: readonly ResolvedProjectionRoom[],
): StageResult<readonly ResolvedProjectionRoom[]> {
  const diagnostics: ProjectionDiagnostic[] = [];
  const resolved: ResolvedProjectionRoom[] = [];

  for (const room of rooms) {
    const areas = room.resolved.areas
      .filter((area) => {
        const definition = getOperationalArea(area.areaKey);
        if (
          definition &&
          definition.departmentKey === room.eligible.department.key
        ) {
          return true;
        }
        diagnostics.push(
          diagnostic(
            "INVALID_EXPERIENCE_CONTRACT",
            `Profile references unknown or mismatched Area ${area.areaKey}`,
            `rooms.${room.eligible.room.context.id}`,
          ),
        );
        return false;
      })
      .map((area) => ({
        ...area,
        experiences: area.experiences.filter((experience) => {
          const definition = getExperience(experience.experienceKey);
          if (!definition) {
            diagnostics.push(
              diagnostic(
                "UNKNOWN_EXPERIENCE_KEY",
                `Profile references unknown Experience ${experience.experienceKey}`,
                `rooms.${room.eligible.room.context.id}`,
              ),
            );
            return false;
          }
          if (
            !definition.departments.includes(room.eligible.department.key) ||
            definition.status !== "active"
          ) {
            diagnostics.push(
              diagnostic(
                "INVALID_EXPERIENCE_CONTRACT",
                `Experience ${experience.experienceKey} is unavailable for ${room.eligible.department.key}`,
                `rooms.${room.eligible.room.context.id}`,
              ),
            );
            return false;
          }
          return true;
        }),
      }))
      .filter((area) => area.experiences.length > 0);
    resolved.push({
      ...room,
      resolved: { ...room.resolved, areas },
    });
  }
  return { value: resolved, diagnostics };
}

export function intersectProjectionPermissions(
  source: ProjectionSource,
  rooms: readonly ResolvedProjectionRoom[],
): StageResult<readonly PermissionedProjectionRoom[]> {
  const diagnostics: ProjectionDiagnostic[] = [];
  const permissioned: PermissionedProjectionRoom[] = [];

  for (const room of rooms) {
    const allowedActionKeysByExperience: Record<string, string[]> = {};
    const areas = room.resolved.areas
      .map((area) => ({
        ...area,
        experiences: area.experiences.filter((resolvedExperience) => {
          const definition = getExperience(resolvedExperience.experienceKey)!;
          if (
            !hasPermission(
              source.request.accessClass.permissionKeys,
              definition.contracts.permissions.readKeys,
            )
          ) {
            diagnostics.push(
              diagnostic(
                "PERMISSION_DENIED",
                `Experience omitted by principal permissions`,
                `rooms.${room.eligible.room.context.id}`,
                "INFO",
              ),
            );
            return false;
          }
          allowedActionKeysByExperience[resolvedExperience.experienceKey] =
            definition.contracts.actions
              .filter((action) =>
                hasPermission(
                  source.request.accessClass.permissionKeys,
                  action.permissionKeys,
                ),
              )
              .map((action) => action.key);
          return true;
        }),
      }))
      .filter((area) => area.experiences.length > 0);
    if (areas.length === 0) continue;
    permissioned.push({
      ...room,
      resolved: { ...room.resolved, areas },
      allowedActionKeysByExperience,
    });
  }
  return { value: permissioned, diagnostics };
}

function makeDescriptor(
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

export function buildProjectionExperiences(
  rooms: readonly PermissionedProjectionRoom[],
): readonly ProjectionExperience[] {
  type MutableExperience = {
    projected: ProjectionExperience;
    locationIds: Set<string>;
    provenance: Set<ProjectionExperienceProvenance>;
  };
  const byId = new Map<string, MutableExperience>();

  for (const room of rooms) {
    for (const area of room.resolved.areas) {
      for (const resolvedExperience of area.experiences) {
        const definition = getExperience(resolvedExperience.experienceKey)!;
        const id = `${room.eligible.department.id}:${definition.key}`;
        const locationId = room.eligible.location.id;
        const source: ProjectionExperienceProvenance =
          room.policyDefaultApplied
            ? "PLANT_POLICY_DEFAULT"
            : resolvedExperience.source;
        const existing = byId.get(id);
        if (existing) {
          existing.locationIds.add(locationId);
          existing.provenance.add(source);
          (
            existing.projected.configurationByLocation as Record<string, unknown>
          )[locationId] = resolvedExperience.effectiveConfiguration;
          (
            existing.projected.archetypeByLocation as Record<string, unknown>
          )[locationId] = room.resolved.archetype;
          continue;
        }
        const queryScopeId = `${id}:scope`;
        const allowedActionKeys =
          room.allowedActionKeysByExperience[definition.key] ?? [];
        const allowedActions = definition.contracts.actions.filter((action) =>
          allowedActionKeys.includes(action.key),
        );
        const projected: ProjectionExperience = {
          id,
          reference: {
            experienceKey: definition.key,
            areaKey: area.areaKey,
            departmentId: room.eligible.department.id,
            departmentKey: room.eligible.department.key,
            locationIds: [],
            relatedExperienceKeys:
              definition.contracts.relationships.relatedExperienceKeys,
            dependencyExperienceKeys: [],
          },
          label: definition.name,
          order: resolvedExperience.sortOrder,
          configurationByLocation: {
            [locationId]: resolvedExperience.effectiveConfiguration,
          },
          archetypeByLocation: {
            [locationId]: room.resolved.archetype,
          },
          contracts: {
            experienceKey: definition.key,
            source: "EXPERIENCE_REGISTRY",
            registryVersion: EXPERIENCE_REGISTRY_VERSION,
            contracts: definition.contracts,
          },
          queryScopeId,
          workspace: {
            default: definition.contracts.workspaceContribution,
            unitWorkspace: definition.contracts.unitWorkspaceContribution,
            businessWorkspace:
              definition.contracts.businessWorkspaceContribution,
            operationsCenter:
              definition.contracts.operationsCenterContribution,
          },
          navigation: definition.contracts.navigationContribution,
          permissions: {
            readKeys: definition.contracts.permissions.readKeys,
            actionPermissionKeys:
              definition.contracts.permissions.actionPermissionKeys,
            allowedActionKeys,
          },
          actions: allowedActions,
          descriptors: [makeDescriptor("EXPERIENCE", id, definition.name)],
          provenance: [],
        };
        byId.set(id, {
          projected,
          locationIds: new Set([locationId]),
          provenance: new Set([source]),
        });
      }
    }
  }

  const projectedKeys = new Set(
    [...byId.values()].map(
      (entry) => entry.projected.reference.experienceKey,
    ),
  );
  return [...byId.values()]
    .map(({ projected, locationIds, provenance }) => ({
      ...projected,
      reference: {
        ...projected.reference,
        locationIds: [...locationIds].sort((a, b) => a.localeCompare(b)),
        relatedExperienceKeys:
          projected.reference.relatedExperienceKeys.filter((key) =>
            projectedKeys.has(key),
          ),
      },
      provenance: [...provenance].sort((a, b) => a.localeCompare(b)),
    }))
    .sort(
      (a, b) =>
        (getOperationalArea(a.reference.areaKey)?.order ?? 0) -
          (getOperationalArea(b.reference.areaKey)?.order ?? 0) ||
        a.order - b.order ||
        a.reference.experienceKey.localeCompare(b.reference.experienceKey),
    );
}

export function buildProjectionAreas(
  experiences: readonly ProjectionExperience[],
): readonly ProjectionArea[] {
  const grouped = new Map<string, ProjectionExperience[]>();
  for (const experience of experiences) {
    const list = grouped.get(experience.reference.areaKey) ?? [];
    list.push(experience);
    grouped.set(experience.reference.areaKey, list);
  }
  return [...grouped.entries()]
    .map(([areaKey, entries]) => {
      const first = entries[0]!;
      const area = requireOperationalArea(areaKey);
      const id = `${first.reference.departmentId}:area:${areaKey}`;
      return {
        id,
        areaKey,
        departmentId: first.reference.departmentId,
        departmentKey: first.reference.departmentKey,
        label: area.name,
        order: area.order,
        experienceIds: entries
          .sort(
            (a, b) =>
              a.order - b.order ||
              a.reference.experienceKey.localeCompare(
                b.reference.experienceKey,
              ),
          )
          .map((experience) => experience.id),
        descriptors: [makeDescriptor("AREA", id, area.name)],
      };
    })
    .sort((a, b) => a.order - b.order || a.areaKey.localeCompare(b.areaKey));
}

export function resolveProjectionQueryScopes(
  experiences: readonly ProjectionExperience[],
  hierarchy: NormalizedProjectionHierarchy,
): ProjectionQueryScopes {
  const byExperience: Record<string, ProjectionQueryScope> = {};
  const byDomain: Record<string, string[]> = {};
  for (const experience of experiences) {
    const locations = experience.reference.locationIds
      .map((id) => hierarchy.locationsById[id])
      .filter((location): location is ProjectionSourceLocation => Boolean(location));
    const unitIds = stableUnique(
      locations.flatMap((location) => {
        if (location.reference.kind === "UNIT") return [location.reference.unitId];
        if (location.reference.kind === "SPACE") return [location.reference.unitId];
        return [];
      }),
    );
    const spaceIds = stableUnique(
      locations.flatMap((location) =>
        location.reference.kind === "SPACE"
          ? [location.reference.spaceId]
          : [],
      ),
    );
    const contract = experience.contracts.contracts.queryScope;
    const scope: ProjectionQueryScope = {
      id: experience.queryScopeId,
      experienceKey: experience.reference.experienceKey,
      departmentId: experience.reference.departmentId,
      departmentKey: experience.reference.departmentKey,
      domains: [...contract.domains],
      grain: contract.grain,
      unitIds,
      spaceIds,
      rules: [...contract.rules],
    };
    byExperience[experience.id] = scope;
    for (const domain of scope.domains) {
      byDomain[domain] = stableUnique([
        ...(byDomain[domain] ?? []),
        scope.id,
      ]);
    }
  }
  return { byExperience, byDomain };
}

export function buildAndPruneProjectionLocations(
  hierarchy: NormalizedProjectionHierarchy,
  experiences: readonly ProjectionExperience[],
): ProjectionSnapshot["locations"] {
  const experienceKeysByLocation = new Map<string, Set<string>>();
  for (const experience of experiences) {
    for (const locationId of experience.reference.locationIds) {
      const keys = experienceKeysByLocation.get(locationId) ?? new Set<string>();
      keys.add(experience.reference.experienceKey);
      experienceKeysByLocation.set(locationId, keys);
    }
  }

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
    const keys = [...(experienceKeysByLocation.get(sourceLocation.id) ?? [])].sort(
      (a, b) => a.localeCompare(b),
    );
    const actionable = keys.length > 0;
    if (!actionable && children.length === 0) return null;
    const node: ProjectionLocationNode = {
      id: sourceLocation.id,
      reference: sourceLocation.reference,
      label: sourceLocation.label,
      presentation: actionable ? "ACTIONABLE" : "STRUCTURAL",
      ancestry,
      experienceKeys: keys,
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
  const revision = {
    ...source.revision,
    experienceRegistryVersion: EXPERIENCE_REGISTRY_VERSION,
  };
  return {
    key: [
      source.facility.id,
      lensKey,
      source.request.purpose,
      revision.hierarchyRevision,
      revision.assignmentRevision,
      revision.profileRevision,
      revision.bindingRevision,
      revision.policyRevision,
      revision.experienceRegistryVersion,
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
      registryVersion: EXPERIENCE_REGISTRY_VERSION,
      notes: ["Wave 15C pure Projection Resolution Pipeline."],
    },
    areas: [],
    experiences: [],
    locations: { roots: [], actionableIds: [], byId: {} },
    queryScopes: { byExperience: {}, byDomain: {} },
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
  const profileStage = resolveActiveProjectionProfile(department);
  diagnostics.push(...profileStage.diagnostics);
  if (!profileStage.value) return deepFreeze(emptySnapshot(source, diagnostics));

  const eligibilityStage = resolveRoomEligibility(source, hierarchy, department);
  diagnostics.push(...eligibilityStage.diagnostics);
  const roomStage = resolveRoomProfiles(
    eligibilityStage.value,
    profileStage.value,
    department,
    Object.keys(hierarchy.roomsById),
  );
  diagnostics.push(...roomStage.diagnostics);
  const contractsStage = resolveRegistryContracts(roomStage.value);
  diagnostics.push(...contractsStage.diagnostics);
  const permissionStage = intersectProjectionPermissions(
    source,
    contractsStage.value,
  );
  diagnostics.push(...permissionStage.diagnostics);

  const experiences = buildProjectionExperiences(permissionStage.value);
  const areas = buildProjectionAreas(experiences);
  const queryScopes = resolveProjectionQueryScopes(experiences, hierarchy);
  const locations = buildAndPruneProjectionLocations(hierarchy, experiences);
  const descriptors = [
    ...areas.flatMap((area) => area.descriptors),
    ...experiences.flatMap((experience) => experience.descriptors),
    ...Object.values(queryScopes.byExperience).map((scope) =>
      makeDescriptor("QUERY_SCOPE", scope.id, scope.experienceKey),
    ),
    ...Object.values(locations.byId).map((location) =>
      makeDescriptor("LOCATION", location.id, location.label),
    ),
  ].sort((a, b) => a.id.localeCompare(b.id));

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
      registryVersion: EXPERIENCE_REGISTRY_VERSION,
      notes: ["Wave 15C pure Projection Resolution Pipeline."],
    },
    areas,
    experiences,
    locations,
    queryScopes,
    descriptors,
    diagnostics: { issues: diagnostics },
    plantPolicy: matchingPolicy
      ? {
          applied: permissionStage.value.some((room) =>
            Boolean(room.eligible.policy),
          ),
          kind: matchingPolicy.kind,
          createsRoomAssignments: false,
          defaultArchetypeKey: matchingPolicy.defaultArchetypeKey,
          coveredLocationIds: stableUnique(
            permissionStage.value
              .filter((room) => room.policyDefaultApplied)
              .map((room) => room.eligible.location.id),
          ),
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
  if (
    source.revision.experienceRegistryVersion !== EXPERIENCE_REGISTRY_VERSION
  ) {
    diagnostics.push(
      diagnostic(
        "SOURCE_INVALID",
        `Source registry revision ${source.revision.experienceRegistryVersion} does not match active registry ${EXPERIENCE_REGISTRY_VERSION}`,
        "source.revision.experienceRegistryVersion",
      ),
    );
  }

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

