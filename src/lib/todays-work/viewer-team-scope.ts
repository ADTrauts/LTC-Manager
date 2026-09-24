/**
 * Viewer Team scope for Today's Work / Walk List.
 *
 * Team is normal operational view scope inside a Department — not a hard
 * security boundary, not today's assignment, and not EmployeeUnitAccess.
 *
 * Configured rooms = explicit DepartmentTeamRoomMembership ∪ rooms whose
 * ACTIVE Operational Type is targeted by the Team. Draft Operational Type
 * assignments never expand this scope.
 */

import type { PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { configuredTeamSpaceIds } from "@/lib/department-teams/team-operational-type-applicability";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import {
  assignmentsFromBindings,
  selectProfileIdForOperationalTypes,
} from "@/lib/operational-cycles/load-operational-type-targets";
import { prisma } from "@/lib/prisma";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

type ViewerTeamScopeDb = Pick<
  PrismaClient,
  | "department"
  | "employeeTeamMembership"
  | "departmentOperationalProfile"
  | "departmentRoomArchetypeBinding"
>;

async function loadRuntimeTeamAssignments(
  db: ViewerTeamScopeDb,
  input: { facilityId: string; departmentId: string },
): Promise<Map<string, { key: string }>> {
  const profiles = await db.departmentOperationalProfile.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: { in: ["DRAFT", "CERTIFIED", "ACTIVE"] },
    },
    select: { id: true, status: true },
    orderBy: { version: "desc" },
  });
  const profileId = selectProfileIdForOperationalTypes(profiles, "runtime");
  if (!profileId) return new Map();

  const bindings = await db.departmentRoomArchetypeBinding.findMany({
    where: { profileId },
    select: {
      unitSpaceId: true,
      archetype: { select: { key: true, name: true, isActive: true } },
    },
  });
  return assignmentsFromBindings(bindings);
}

export type ViewerTeamScopeMode =
  | "DEPARTMENT_WIDE"
  | "TEAM_SCOPED"
  | "TEAM_WITHOUT_LOCATIONS";

export type ViewerTeamScopeReason =
  | "FACILITY_ADMINISTRATOR"
  | "DEPARTMENT_MANAGER"
  | "NO_LINKED_EMPLOYEE"
  | "NO_ACTIVE_TEAM_MEMBERSHIP"
  | "ACTIVE_TEAM_MEMBERSHIP"
  | "TEAM_MEMBERSHIP_WITHOUT_ROOMS";

export type ViewerTeamScopeTeam = {
  id: string;
  name: string;
};

export type ViewerTeamScope = {
  mode: ViewerTeamScopeMode;
  reason: ViewerTeamScopeReason;
  departmentId: string;
  departmentLabel: string;
  employeeId: string | null;
  activeTeams: readonly ViewerTeamScopeTeam[];
  roomIds: readonly string[];
};

export type TeamMembershipScopeRow = {
  id: string;
  name: string;
  roomIds: readonly string[];
};

export function uniqueRoomIds(teams: readonly TeamMembershipScopeRow[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const team of teams) {
    for (const roomId of team.roomIds) {
      if (!roomId || seen.has(roomId)) continue;
      seen.add(roomId);
      ids.push(roomId);
    }
  }
  return ids;
}

export function evaluateViewerTeamScope(input: {
  departmentId: string;
  departmentLabel: string;
  employeeId: string | null;
  isFacilityAdministrator: boolean;
  isDepartmentManager: boolean;
  teams: readonly TeamMembershipScopeRow[];
}): ViewerTeamScope {
  const activeTeams = input.teams.map((team) => ({ id: team.id, name: team.name }));
  const roomIds = uniqueRoomIds(input.teams);

  if (input.isFacilityAdministrator) {
    return {
      mode: "DEPARTMENT_WIDE",
      reason: "FACILITY_ADMINISTRATOR",
      departmentId: input.departmentId,
      departmentLabel: input.departmentLabel,
      employeeId: input.employeeId,
      activeTeams,
      roomIds: [],
    };
  }

  if (input.isDepartmentManager) {
    return {
      mode: "DEPARTMENT_WIDE",
      reason: "DEPARTMENT_MANAGER",
      departmentId: input.departmentId,
      departmentLabel: input.departmentLabel,
      employeeId: input.employeeId,
      activeTeams,
      roomIds: [],
    };
  }

  if (!input.employeeId) {
    return {
      mode: "DEPARTMENT_WIDE",
      reason: "NO_LINKED_EMPLOYEE",
      departmentId: input.departmentId,
      departmentLabel: input.departmentLabel,
      employeeId: null,
      activeTeams: [],
      roomIds: [],
    };
  }

  if (input.teams.length === 0) {
    return {
      mode: "DEPARTMENT_WIDE",
      reason: "NO_ACTIVE_TEAM_MEMBERSHIP",
      departmentId: input.departmentId,
      departmentLabel: input.departmentLabel,
      employeeId: input.employeeId,
      activeTeams: [],
      roomIds: [],
    };
  }

  if (roomIds.length === 0) {
    return {
      mode: "TEAM_WITHOUT_LOCATIONS",
      reason: "TEAM_MEMBERSHIP_WITHOUT_ROOMS",
      departmentId: input.departmentId,
      departmentLabel: input.departmentLabel,
      employeeId: input.employeeId,
      activeTeams,
      roomIds: [],
    };
  }

  return {
    mode: "TEAM_SCOPED",
    reason: "ACTIVE_TEAM_MEMBERSHIP",
    departmentId: input.departmentId,
    departmentLabel: input.departmentLabel,
    employeeId: input.employeeId,
    activeTeams,
    roomIds,
  };
}

export function formatViewerTeamScopeLabel(scope: ViewerTeamScope): string {
  if (scope.mode === "DEPARTMENT_WIDE") {
    return `All ${scope.departmentLabel}`;
  }
  const names = scope.activeTeams.map((team) => team.name);
  if (names.length === 0) return `All ${scope.departmentLabel}`;
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names.length} Teams`;
}

export function isTeamUnconfiguredScope(scope: ViewerTeamScope | null | undefined): boolean {
  return scope?.mode === "TEAM_WITHOUT_LOCATIONS";
}

/** After intersecting Team rooms with the current Department footprint, empty ≠ Department-wide fallback. */
export function narrowTeamScopeToCollectedRooms(
  scope: ViewerTeamScope,
  collectedRoomIds: ReadonlySet<string>,
): ViewerTeamScope {
  if (scope.mode !== "TEAM_SCOPED") return scope;
  const roomIds = scope.roomIds.filter((roomId) => collectedRoomIds.has(roomId));
  if (roomIds.length > 0) return { ...scope, roomIds };
  return {
    ...scope,
    mode: "TEAM_WITHOUT_LOCATIONS",
    reason: "TEAM_MEMBERSHIP_WITHOUT_ROOMS",
    roomIds: [],
  };
}

/** `undefined` = do not filter Key Times / Current Operations. Empty set = hide department-wide rows. */
export function keyTimeSpaceFilterFromTeamScope(
  scope: ViewerTeamScope | null | undefined,
): ReadonlySet<string> | undefined {
  if (!scope || scope.mode === "DEPARTMENT_WIDE") return undefined;
  return new Set(scope.roomIds);
}

export async function resolveViewerTeamScopes(input: {
  session: AppJwtPayload;
  facilityId: string;
  departments: readonly { id: string; label: string }[];
  db?: ViewerTeamScopeDb;
  resolveEmployeeId?: (session: AppJwtPayload) => Promise<string | null>;
}): Promise<Map<string, ViewerTeamScope>> {
  const scopes = new Map<string, ViewerTeamScope>();
  if (input.departments.length === 0) return scopes;

  const db = input.db ?? prisma;
  const isFacilityAdministrator = isFacilityAdministratorRole(input.session.role);
  const resolveEmployeeId = input.resolveEmployeeId ?? getOperationalEmployeeIdForSession;
  const employeeId =
    input.session.facilityId === input.facilityId ? await resolveEmployeeId(input.session) : null;

  const departmentIds = input.departments.map((department) => department.id);
  const departments = await db.department.findMany({
    where: { id: { in: departmentIds }, facilityId: input.facilityId },
    select: { id: true, name: true, headEmployeeId: true },
  });
  const departmentById = new Map(departments.map((row) => [row.id, row]));

  const memberships =
    employeeId == null
      ? []
      : await db.employeeTeamMembership.findMany({
          where: {
            employeeId,
            team: {
              facilityId: input.facilityId,
              status: "ACTIVE",
              departmentId: { in: departmentIds },
            },
          },
          select: {
            team: {
              select: {
                id: true,
                displayName: true,
                departmentId: true,
                applicableOperationalTypeKeys: true,
                roomMemberships: { select: { spaceId: true } },
              },
            },
          },
        });

  const departmentIdsNeedingOt = [
    ...new Set(
      memberships
        .filter((row) => row.team.applicableOperationalTypeKeys.length > 0)
        .map((row) => row.team.departmentId),
    ),
  ];
  const assignmentsByDepartmentId = new Map<string, Map<string, { key: string }>>();
  for (const departmentId of departmentIdsNeedingOt) {
    assignmentsByDepartmentId.set(
      departmentId,
      await loadRuntimeTeamAssignments(db, {
        facilityId: input.facilityId,
        departmentId,
      }),
    );
  }

  const teamsByDepartmentId = new Map<string, TeamMembershipScopeRow[]>();
  for (const row of memberships) {
    const list = teamsByDepartmentId.get(row.team.departmentId) ?? [];
    list.push({
      id: row.team.id,
      name: row.team.displayName,
      roomIds: configuredTeamSpaceIds({
        explicitSpaceIds: row.team.roomMemberships.map((membership) => membership.spaceId),
        applicableOperationalTypeKeys: row.team.applicableOperationalTypeKeys,
        runtimeAssignments: assignmentsByDepartmentId.get(row.team.departmentId) ?? new Map(),
      }),
    });
    teamsByDepartmentId.set(row.team.departmentId, list);
  }

  for (const department of input.departments) {
    const record = departmentById.get(department.id);
    const label = record?.name ?? department.label;
    const teams = teamsByDepartmentId.get(department.id) ?? [];
    scopes.set(
      department.id,
      evaluateViewerTeamScope({
        departmentId: department.id,
        departmentLabel: label,
        employeeId,
        isFacilityAdministrator,
        isDepartmentManager: Boolean(employeeId && record?.headEmployeeId === employeeId),
        teams,
      }),
    );
  }

  return scopes;
}
