/**
 * Wave 15D — Projection Source Adapter.
 *
 * One coordinated load of authoritative application data into ProjectionSource.
 * Contains no Projection resolution logic — that belongs to Wave 15C.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  PLANT_FACILITY_WIDE_POLICY,
  toProfileSnapshot,
  type ExperienceConfiguration,
  type ProfileSnapshot,
  type RoomArchetypeBindingSnapshot,
  type RoomExceptionSnapshot,
} from "@/lib/department-administration";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { EXPERIENCE_REGISTRY_VERSION } from "@/lib/experiences";
import { isStagedUnit, isUndesignatedSpace } from "@/lib/facility-builder/operational-visibility";
import { prisma as defaultPrisma } from "@/lib/prisma";

import type {
  ProjectionSource,
  ProjectionSourceDepartment,
  ProjectionSourceLocation,
  ProjectionSourcePolicy,
  ProjectionSourceRoom,
} from "./source";
import type {
  ProjectionDiagnostic,
  ProjectionRequest,
  ProjectionRevision,
} from "./types";

const OPERATIONAL_DEPARTMENT_KEYS = new Set<string>(["DIETARY", "EVS", "PLANT"]);

const ACTIVE_PROFILE_INCLUDE = {
  department: {
    select: { id: true, key: true, facilityId: true, isActive: true },
  },
  areas: {
    orderBy: { sortOrder: "asc" as const },
    include: { experiences: { orderBy: { sortOrder: "asc" as const } } },
  },
  archetypes: {
    orderBy: { sortOrder: "asc" as const },
    include: { experiences: { orderBy: { sortOrder: "asc" as const } } },
  },
  roomBindings: true,
  roomExceptions: true,
} satisfies Prisma.DepartmentOperationalProfileInclude;

type LoadedActiveProfile = Prisma.DepartmentOperationalProfileGetPayload<{
  include: typeof ACTIVE_PROFILE_INCLUDE;
}>;

export type ProjectionSourceLoadDb = {
  facility: {
    findUnique: PrismaClient["facility"]["findUnique"];
  };
};

export type ProjectionSourceLoadResult = {
  source: ProjectionSource | null;
  diagnostics: ProjectionDiagnostic[];
  loadDurationMs: number;
};

function diagnostic(
  code: ProjectionDiagnostic["code"],
  message: string,
  path?: string,
  severity: ProjectionDiagnostic["severity"] = "ERROR",
): ProjectionDiagnostic {
  return { code, message, path, severity };
}

function asIso(value: Date | string | null | undefined): string {
  if (!value) return "0";
  if (typeof value === "string") return value;
  return value.toISOString();
}

function maxIso(values: readonly string[]): string {
  return values.reduce((max, value) => (value > max ? value : max), "0");
}

function facilityLocationId(facilityId: string): string {
  return `facility:${facilityId}`;
}

function unitLocationId(unitId: string): string {
  return `unit:${unitId}`;
}

function spaceLocationId(spaceId: string): string {
  return `space:${spaceId}`;
}

function isOperationalDepartmentKey(
  value: string,
): value is OperationalDepartmentKey {
  return OPERATIONAL_DEPARTMENT_KEYS.has(value);
}

function mapHierarchyRole(
  role: string | null | undefined,
): "FLOOR" | "NEIGHBORHOOD" | "LEGACY" {
  if (role === "FLOOR") return "FLOOR";
  if (role === "NEIGHBORHOOD") return "NEIGHBORHOOD";
  return "LEGACY";
}

function mapParentHierarchyRole(
  role: string | null | undefined,
): "FLOOR" | "NEIGHBORHOOD" | "LEGACY_LOCATION" | "STAGED" | null {
  if (role === "FLOOR") return "FLOOR";
  if (role === "NEIGHBORHOOD") return "NEIGHBORHOOD";
  if (role === "LEGACY_LOCATION") return "LEGACY_LOCATION";
  if (role === "STAGED") return "STAGED";
  return null;
}

function asConfiguration(
  value: Prisma.JsonValue | null,
): ExperienceConfiguration | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as ExperienceConfiguration;
}

/**
 * Coordinated ProjectionSource load.
 * Prefer injecting `db` in tests; production defaults to the shared Prisma client.
 */
export async function loadProjectionSource(
  request: ProjectionRequest,
  db: ProjectionSourceLoadDb = defaultPrisma,
): Promise<ProjectionSourceLoadResult> {
  const started = performance.now();
  const diagnostics: ProjectionDiagnostic[] = [];

  if (!request.facilityId.trim()) {
    return {
      source: null,
      diagnostics: [
        diagnostic(
          "SOURCE_INVALID",
          "ProjectionRequest.facilityId is required",
          "request.facilityId",
        ),
      ],
      loadDurationMs: performance.now() - started,
    };
  }

  const facility = await db.facility.findUnique({
    where: { id: request.facilityId },
    select: {
      id: true,
      displayName: true,
      vocabularyProfile: true,
      updatedAt: true,
      units: {
        select: {
          id: true,
          name: true,
          isActive: true,
          hierarchyRole: true,
          parentUnitId: true,
          displayOrder: true,
          updatedAt: true,
        },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      },
      unitSpaces: {
        select: {
          id: true,
          name: true,
          spaceType: true,
          customTypeLabel: true,
          isActive: true,
          unitId: true,
          sortOrder: true,
          updatedAt: true,
          unit: { select: { id: true, hierarchyRole: true } },
          responsibilities: {
            select: {
              departmentId: true,
              updatedAt: true,
              department: { select: { facilityId: true } },
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
      departments: {
        select: {
          id: true,
          key: true,
          name: true,
          isActive: true,
          updatedAt: true,
          operationalProfiles: {
            where: { status: "ACTIVE" },
            take: 1,
            include: ACTIVE_PROFILE_INCLUDE,
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
  });

  if (!facility) {
    return {
      source: null,
      diagnostics: [
        diagnostic(
          "SOURCE_INVALID",
          `Unknown facility ${request.facilityId}`,
          "request.facilityId",
        ),
      ],
      loadDurationMs: performance.now() - started,
    };
  }

  if (request.facilityId !== facility.id) {
    diagnostics.push(
      diagnostic(
        "SOURCE_INVALID",
        "Request facilityId does not match loaded facility",
        "request.facilityId",
      ),
    );
  }

  const locations: ProjectionSourceLocation[] = [];
  const rooms: ProjectionSourceRoom[] = [];
  const hierarchyTimestamps = [asIso(facility.updatedAt)];
  const assignmentTimestamps: string[] = [];
  const profileTimestamps: string[] = [];
  const bindingTimestamps: string[] = [];

  locations.push({
    id: facilityLocationId(facility.id),
    reference: { kind: "FACILITY", facilityId: facility.id },
    parentId: null,
    label: facility.displayName,
    isActive: true,
    isPlaced: true,
  });

  const unitById = new Map(facility.units.map((unit) => [unit.id, unit]));

  for (const unit of facility.units) {
    hierarchyTimestamps.push(asIso(unit.updatedAt));
    const staged = isStagedUnit(unit);
    const parentId = unit.parentUnitId
      ? unitLocationId(unit.parentUnitId)
      : facilityLocationId(facility.id);

    if (unit.parentUnitId && !unitById.has(unit.parentUnitId)) {
      diagnostics.push(
        diagnostic(
          "INVALID_LOCATION_REFERENCE",
          `Unit ${unit.id} references missing parent ${unit.parentUnitId}`,
          `units.${unit.id}.parentUnitId`,
        ),
      );
    }

    locations.push({
      id: unitLocationId(unit.id),
      reference: {
        kind: "UNIT",
        facilityId: facility.id,
        unitId: unit.id,
        hierarchyRole: mapHierarchyRole(unit.hierarchyRole),
      },
      parentId,
      label: unit.name,
      isActive: unit.isActive && !staged,
      isPlaced: !staged,
    });
  }

  for (const space of facility.unitSpaces) {
    hierarchyTimestamps.push(asIso(space.updatedAt));
    const undesignated = isUndesignatedSpace(space);
    const parentUnit = space.unitId ? unitById.get(space.unitId) : null;
    const parentStaged = parentUnit ? isStagedUnit(parentUnit) : false;
    const parentId = space.unitId
      ? unitLocationId(space.unitId)
      : facilityLocationId(facility.id);

    if (space.unitId && !parentUnit) {
      diagnostics.push(
        diagnostic(
          "INVALID_LOCATION_REFERENCE",
          `Room ${space.id} references missing unit ${space.unitId}`,
          `unitSpaces.${space.id}.unitId`,
        ),
      );
    }

    const assignedDepartmentIds: string[] = [];
    for (const responsibility of space.responsibilities) {
      assignmentTimestamps.push(asIso(responsibility.updatedAt));
      if (responsibility.department.facilityId !== facility.id) {
        diagnostics.push(
          diagnostic(
            "SOURCE_INVALID",
            `Cross-facility department assignment on room ${space.id}`,
            `unitSpaces.${space.id}.responsibilities`,
          ),
        );
        continue;
      }
      assignedDepartmentIds.push(responsibility.departmentId);
    }

    locations.push({
      id: spaceLocationId(space.id),
      reference: {
        kind: "SPACE",
        facilityId: facility.id,
        unitId: space.unitId ?? "",
        spaceId: space.id,
        roomRole: space.customTypeLabel ?? space.spaceType,
      },
      parentId,
      label: space.name,
      isActive: space.isActive && !undesignated && !parentStaged,
      isPlaced: !undesignated && !parentStaged && Boolean(space.unitId),
    });

    rooms.push({
      locationId: spaceLocationId(space.id),
      context: {
        id: space.id,
        facilityId: facility.id,
        isActive: space.isActive,
        unitId: space.unitId,
        parentHierarchyRole: mapParentHierarchyRole(
          parentUnit?.hierarchyRole ?? null,
        ),
        assignedDepartmentIds: [...assignedDepartmentIds].sort(),
      },
    });
  }

  const departments: ProjectionSourceDepartment[] = [];
  const policies: ProjectionSourcePolicy[] = [];

  for (const department of facility.departments) {
    if (!isOperationalDepartmentKey(department.key)) {
      diagnostics.push(
        diagnostic(
          "UNKNOWN_DEPARTMENT",
          `Skipping non-operational department key ${department.key}`,
          `departments.${department.id}`,
          "INFO",
        ),
      );
      continue;
    }

    const activeRow = department.operationalProfiles[0] as
      | LoadedActiveProfile
      | undefined;
    let activeProfile: ProfileSnapshot | null = null;
    const archetypeBindings: RoomArchetypeBindingSnapshot[] = [];
    const roomExceptions: RoomExceptionSnapshot[] = [];

    if (activeRow) {
      if (activeRow.facilityId !== facility.id) {
        diagnostics.push(
          diagnostic(
            "SOURCE_INVALID",
            `ACTIVE profile ${activeRow.id} belongs to another facility`,
            `departments.${department.id}.activeProfile`,
          ),
        );
      } else if (activeRow.departmentId !== department.id) {
        diagnostics.push(
          diagnostic(
            "SOURCE_INVALID",
            `ACTIVE profile ${activeRow.id} does not belong to department ${department.id}`,
            `departments.${department.id}.activeProfile`,
          ),
        );
      } else {
        activeProfile = toProfileSnapshot(
          activeRow as Parameters<typeof toProfileSnapshot>[0],
        );
        profileTimestamps.push(
          `${activeRow.id}:${activeRow.version}:${asIso(activeRow.updatedAt)}`,
        );

        for (const binding of activeRow.roomBindings) {
          bindingTimestamps.push(asIso(binding.createdAt));
          const room = rooms.find(
            (candidate) => candidate.context.id === binding.unitSpaceId,
          );
          if (!room || room.context.facilityId !== facility.id) {
            diagnostics.push(
              diagnostic(
                "ORPHAN_BINDING",
                `Binding ${binding.id} references out-of-facility or unknown room`,
                `bindings.${binding.id}`,
              ),
            );
            continue;
          }
          archetypeBindings.push({
            id: binding.id,
            unitSpaceId: binding.unitSpaceId,
            archetypeId: binding.archetypeId,
          });
        }

        for (const exception of activeRow.roomExceptions) {
          bindingTimestamps.push(asIso(exception.createdAt));
          const room = rooms.find(
            (candidate) => candidate.context.id === exception.unitSpaceId,
          );
          if (!room || room.context.facilityId !== facility.id) {
            diagnostics.push(
              diagnostic(
                "ROOM_EXCEPTION_INVALID",
                `Exception ${exception.id} references out-of-facility or unknown room`,
                `exceptions.${exception.id}`,
              ),
            );
            continue;
          }
          roomExceptions.push({
            id: exception.id,
            unitSpaceId: exception.unitSpaceId,
            areaExperienceId: exception.areaExperienceId,
            mode: exception.mode,
            configuration: asConfiguration(exception.configurationJson),
            reason: exception.reason,
          });
        }
      }
    } else if (department.isActive) {
      diagnostics.push(
        diagnostic(
          "MISSING_ACTIVE_PROFILE",
          `Department ${department.key} has no ACTIVE Operational Profile`,
          `departments.${department.id}.activeProfile`,
          "WARNING",
        ),
      );
    }

    const assignedRoomIds = rooms
      .filter((room) =>
        room.context.assignedDepartmentIds.includes(department.id),
      )
      .map((room) => room.context.id)
      .sort((a, b) => a.localeCompare(b));

    departments.push({
      id: department.id,
      key: department.key,
      label: department.name,
      isActive: department.isActive,
      activeProfile,
      assignedRoomIds,
      archetypeBindings: archetypeBindings.sort((a, b) =>
        a.unitSpaceId.localeCompare(b.unitSpaceId),
      ),
      roomExceptions: roomExceptions.sort(
        (a, b) =>
          a.unitSpaceId.localeCompare(b.unitSpaceId) ||
          a.areaExperienceId.localeCompare(b.areaExperienceId),
      ),
    });

    if (department.key === "PLANT" && department.isActive) {
      policies.push({
        kind: PLANT_FACILITY_WIDE_POLICY.kind,
        departmentId: department.id,
        departmentKey: department.key,
        defaultArchetypeKey: PLANT_FACILITY_WIDE_POLICY.defaultArchetypeKey,
        directBindingsTakePrecedence: true,
        createsRoomAssignments: false,
      });
    }
  }

  if (request.lens.mode === "DEPARTMENT") {
    const lens = request.lens;
    const lensDepartment = departments.find(
      (department) =>
        department.id === lens.departmentId &&
        department.key === lens.departmentKey,
    );
    if (!lensDepartment) {
      diagnostics.push(
        diagnostic(
          "UNKNOWN_DEPARTMENT",
          `Unknown department lens ${lens.departmentId}/${lens.departmentKey}`,
          "request.lens",
        ),
      );
    } else if (!lensDepartment.isActive) {
      diagnostics.push(
        diagnostic(
          "INACTIVE_DEPARTMENT",
          `Department ${lensDepartment.key} is inactive`,
          `departments.${lensDepartment.id}`,
        ),
      );
    }
  }

  const revision: ProjectionRevision = {
    hierarchyRevision: `hierarchy:${maxIso(hierarchyTimestamps)}`,
    assignmentRevision: `assignments:${maxIso(assignmentTimestamps)}`,
    profileRevision: `profiles:${profileTimestamps.sort().join("|") || "none"}`,
    bindingRevision: `bindings:${maxIso(bindingTimestamps)}`,
    policyRevision: `policy:${PLANT_FACILITY_WIDE_POLICY.kind}:${PLANT_FACILITY_WIDE_POLICY.defaultArchetypeKey}`,
    experienceRegistryVersion: EXPERIENCE_REGISTRY_VERSION,
    accessClassRevision: `access:${request.accessClass.key}`,
  };

  const source: ProjectionSource = {
    request,
    facility: {
      id: facility.id,
      label: facility.displayName,
    },
    locations: locations.sort((a, b) => a.id.localeCompare(b.id)),
    rooms: rooms.sort((a, b) => a.context.id.localeCompare(b.context.id)),
    departments: departments.sort((a, b) => a.key.localeCompare(b.key)),
    policies,
    revision,
    resolvedAt: request.asOf ?? new Date().toISOString(),
  };

  return {
    source,
    diagnostics,
    loadDurationMs: performance.now() - started,
  };
}
