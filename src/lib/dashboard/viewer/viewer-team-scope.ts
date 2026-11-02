/**
 * Operational placement for Today's Work / Walk List.
 *
 * This is where the employee is working today. It is not authorization,
 * not Team membership, and not a Location Function expansion.
 *
 * Facility administrators, department heads, and supervisor-or-above roles
 * see the Department. A frontline employee sees rooms on today's
 * Operational Assignment. A Team does not own those rooms.
 */

import type { PrismaClient } from "@prisma/client";

import { hasAtLeastRole } from "@/lib/access";
import type { FacilitySession } from "@/lib/auth";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { getFacilityServiceDate } from "@/lib/operational-time/service-date";
import { loadFacilityTimezone } from "@/lib/operational-time/load-facility-timezone";
import { prisma } from "@/lib/prisma";
import { isPlanFrontlineVisible } from "@/lib/scheduling/operational-assignments/assignment-plan";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

type ViewerTeamScopeDb = Pick<
  PrismaClient,
  "department" | "employeeTeamMembership" | "operationalAssignment" | "facility"
>;

export type ViewerTeamScopeMode =
  | "DEPARTMENT_WIDE"
  | "ASSIGNMENT_SCOPED"
  | "ASSIGNMENT_WITHOUT_PLACEMENT";

export type ViewerTeamScopeReason =
  | "FACILITY_ADMINISTRATOR"
  | "DEPARTMENT_MANAGER"
  | "DEPARTMENT_AUTHORITY"
  | "NO_LINKED_EMPLOYEE"
  | "TODAYS_ASSIGNMENT"
  | "NO_ASSIGNMENT_TODAY";

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
  hasDepartmentAuthority: boolean;
  assignedRoomIds: readonly string[];
  teams?: readonly { id: string; name: string }[];
}): ViewerTeamScope {
  const activeTeams = (input.teams ?? []).map((team) => ({ id: team.id, name: team.name }));
  const base = {
    departmentId: input.departmentId,
    departmentLabel: input.departmentLabel,
    employeeId: input.employeeId,
    activeTeams,
  };

  if (input.isFacilityAdministrator) {
    return { ...base, mode: "DEPARTMENT_WIDE", reason: "FACILITY_ADMINISTRATOR", roomIds: [] };
  }
  if (input.isDepartmentManager) {
    return { ...base, mode: "DEPARTMENT_WIDE", reason: "DEPARTMENT_MANAGER", roomIds: [] };
  }
  if (input.hasDepartmentAuthority) {
    return { ...base, mode: "DEPARTMENT_WIDE", reason: "DEPARTMENT_AUTHORITY", roomIds: [] };
  }
  if (!input.employeeId) {
    return {
      ...base,
      mode: "DEPARTMENT_WIDE",
      reason: "NO_LINKED_EMPLOYEE",
      employeeId: null,
      activeTeams: [],
      roomIds: [],
    };
  }

  const roomIds = [...new Set(input.assignedRoomIds.filter(Boolean))];
  if (roomIds.length === 0) {
    return {
      ...base,
      mode: "ASSIGNMENT_WITHOUT_PLACEMENT",
      reason: "NO_ASSIGNMENT_TODAY",
      roomIds: [],
    };
  }
  return {
    ...base,
    mode: "ASSIGNMENT_SCOPED",
    reason: "TODAYS_ASSIGNMENT",
    roomIds,
  };
}

export function formatViewerTeamScopeLabel(scope: ViewerTeamScope): string {
  if (scope.mode === "DEPARTMENT_WIDE") return `All ${scope.departmentLabel}`;
  if (scope.mode === "ASSIGNMENT_SCOPED") return "Today's assignment";
  return "No assignment today";
}

export function isTeamUnconfiguredScope(scope: ViewerTeamScope | null | undefined): boolean {
  return scope?.mode === "ASSIGNMENT_WITHOUT_PLACEMENT";
}

/** After intersecting assigned rooms with the current Department footprint, empty stays empty. */
export function narrowTeamScopeToCollectedRooms(
  scope: ViewerTeamScope,
  collectedRoomIds: ReadonlySet<string>,
): ViewerTeamScope {
  if (scope.mode !== "ASSIGNMENT_SCOPED") return scope;
  const roomIds = scope.roomIds.filter((roomId) => collectedRoomIds.has(roomId));
  if (roomIds.length > 0) return { ...scope, roomIds };
  return {
    ...scope,
    mode: "ASSIGNMENT_WITHOUT_PLACEMENT",
    reason: "NO_ASSIGNMENT_TODAY",
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
  session: FacilitySession;
  facilityId: string;
  departments: readonly { id: string; label: string }[];
  db?: ViewerTeamScopeDb;
  resolveEmployeeId?: (session: FacilitySession) => Promise<string | null>;
}): Promise<Map<string, ViewerTeamScope>> {
  const scopes = new Map<string, ViewerTeamScope>();
  if (input.departments.length === 0) return scopes;

  const db = input.db ?? prisma;
  const isFacilityAdministrator = isFacilityAdministratorRole(input.session.role);
  const resolveEmployeeId = input.resolveEmployeeId ?? getOperationalEmployeeIdForSession;
  const employeeId =
    input.session.facilityId === input.facilityId ? await resolveEmployeeId(input.session) : null;

  const departmentIds = input.departments.map((department) => department.id);
  const hasDepartmentAuthority = hasAtLeastRole(input.session.role, "SUPERVISOR");
  const timezone = await loadFacilityTimezone(db, input.facilityId);
  const serviceDate = getFacilityServiceDate(timezone);
  const [departments, memberships, placements] = await Promise.all([
    db.department.findMany({
      where: { id: { in: departmentIds }, facilityId: input.facilityId },
      select: { id: true, name: true, headEmployeeId: true },
    }),
    employeeId == null
      ? Promise.resolve([])
      : db.employeeTeamMembership.findMany({
          where: {
            employeeId,
            team: {
              facilityId: input.facilityId,
              status: "ACTIVE",
              departmentId: { in: departmentIds },
            },
          },
          select: {
            team: { select: { id: true, displayName: true, departmentId: true } },
          },
        }),
    employeeId == null
      ? Promise.resolve([])
      : db.operationalAssignment.findMany({
          where: {
            facilityId: input.facilityId,
            employeeId,
            departmentId: { in: departmentIds },
            serviceDate,
            status: { in: ["PLANNED", "ACTIVE"] },
          },
          select: {
            departmentId: true,
            plan: { select: { status: true } },
            locations: { select: { unitSpaceId: true } },
          },
        }),
  ]);
  const departmentById = new Map(departments.map((row) => [row.id, row]));
  const teamsByDepartmentId = new Map<string, { id: string; name: string }[]>();
  for (const row of memberships) {
    const list = teamsByDepartmentId.get(row.team.departmentId) ?? [];
    list.push({ id: row.team.id, name: row.team.displayName });
    teamsByDepartmentId.set(row.team.departmentId, list);
  }
  const roomsByDepartmentId = new Map<string, string[]>();
  for (const row of placements) {
    if (!isPlanFrontlineVisible(row.plan?.status ?? null)) continue;
    const list = roomsByDepartmentId.get(row.departmentId) ?? [];
    for (const location of row.locations) list.push(location.unitSpaceId);
    roomsByDepartmentId.set(row.departmentId, list);
  }

  for (const department of input.departments) {
    const record = departmentById.get(department.id);
    scopes.set(
      department.id,
      evaluateViewerTeamScope({
        departmentId: department.id,
        departmentLabel: record?.name ?? department.label,
        employeeId,
        isFacilityAdministrator,
        isDepartmentManager: Boolean(employeeId && record?.headEmployeeId === employeeId),
        hasDepartmentAuthority,
        assignedRoomIds: roomsByDepartmentId.get(department.id) ?? [],
        teams: teamsByDepartmentId.get(department.id) ?? [],
      }),
    );
  }

  return scopes;
}
