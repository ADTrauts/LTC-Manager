/**
 * Department Teams — enduring organizational subgroups inside one Department.
 *
 * Build configuration only. Does not write Zones, Cycles, WorkStations,
 * Department responsibility, Employee membership, or OperationalAssignment.
 * Team → Operational Type keys persist immediately (same as room membership).
 * Run consumers must resolve those keys through ACTIVE Operational Types only.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import type { AppJwtPayload } from "@/lib/auth";
import { loadDepartmentLocationsView } from "@/lib/department-administration/load-department-admin";
import { listFacilityRoomTypes } from "@/lib/facility-builder/facility-room-types";
import { prisma } from "@/lib/prisma";

import {
  decideTeamAuthority,
  requireTeamManage,
  type TeamAuthorityDecision,
} from "./authority";
import type { DepartmentTeamView, TeamCatalog, TeamEmployeeOption, TeamRoomView } from "./types";
import { loadTeamCyclesForDepartment } from "./team-cycles";
import { loadDepartmentOperationalTypeOptions } from "@/lib/operational-cycles/load-operational-type-targets";
import { validateTeamOperationalTypeKeys } from "./team-operational-type-applicability";
import {
  evaluateTeamManagerCandidate,
  normalizeTeamDescription,
  normalizeTeamDisplayName,
  teamNamesConflict,
  validateTeamRoomSubmission,
} from "./validation";
import { employeeBelongsToDepartment } from "@/lib/employee-membership";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export async function resolveTeamAuthority(
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
): Promise<TeamAuthorityDecision> {
  if (session.facilityId !== facilityId) {
    return decideTeamAuthority({
      role: session.role as AppRole,
      authMethod: session.authMethod,
      sessionFacilityId: session.facilityId,
      facilityId,
      departmentExists: false,
    });
  }
  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true },
  });
  return decideTeamAuthority({
    role: session.role as AppRole,
    authMethod: session.authMethod,
    sessionFacilityId: session.facilityId,
    facilityId,
    departmentExists: Boolean(department),
  });
}

export async function loadAllowedTeamSpaceIds(
  client: DbClient,
  input: { facilityId: string; departmentId: string },
): Promise<Set<string>> {
  const rows = await client.unitSpaceResponsibility.findMany({
    where: {
      departmentId: input.departmentId,
      space: { facilityId: input.facilityId, isActive: true },
    },
    select: { spaceId: true },
  });
  return new Set(rows.map((row) => row.spaceId));
}

async function assertActiveTeamNameAvailable(
  client: DbClient,
  input: {
    departmentId: string;
    displayName: string;
    excludeTeamId?: string;
  },
): Promise<void> {
  const existing = await client.departmentTeam.findMany({
    where: {
      departmentId: input.departmentId,
      status: "ACTIVE",
      ...(input.excludeTeamId ? { id: { not: input.excludeTeamId } } : {}),
    },
    select: { displayName: true },
  });
  if (existing.some((row) => teamNamesConflict(row.displayName, input.displayName))) {
    throw new Error("An active Team with this name already exists in this Department.");
  }
}

async function resolveManagerEmployeeId(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    managerEmployeeId: string | null;
  },
): Promise<string | null> {
  if (!input.managerEmployeeId) return null;
  const employee = await client.employee.findFirst({
    where: { id: input.managerEmployeeId, facilityId: input.facilityId },
    select: {
      id: true,
      facilityId: true,
      status: true,
      primaryDepartmentId: true,
      employeeDepartments: { select: { departmentId: true } },
    },
  });
  if (!employee) {
    throw new Error("Team Manager not found.");
  }
  const decision = evaluateTeamManagerCandidate(
    {
      id: employee.id,
      facilityId: employee.facilityId,
      status: employee.status,
      primaryDepartmentId: employee.primaryDepartmentId,
      membershipDepartmentIds: employee.employeeDepartments.map((row) => row.departmentId),
    },
    { facilityId: input.facilityId, departmentId: input.departmentId },
  );
  if (!decision.ok) throw new Error(decision.reason);
  return employee.id;
}

async function resolveTeamRoomWrites(
  client: DbClient,
  input: { facilityId: string; departmentId: string; spaceIds: readonly string[] },
): Promise<string[]> {
  const unique = [...new Set(input.spaceIds.filter(Boolean))];
  const allowed = await loadAllowedTeamSpaceIds(client, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
  });
  return validateTeamRoomSubmission({
    submittedSpaceIds: unique,
    allowedSpaceIds: allowed,
  });
}

async function resolveTeamOperationalTypeWrites(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    operationalTypeKeys: readonly string[];
  },
): Promise<string[]> {
  const options = await loadDepartmentOperationalTypeOptions({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    perspective: "working",
  });
  const existing = await client.departmentRoomArchetype.findMany({
    where: {
      key: { in: [...input.operationalTypeKeys] },
      profile: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        status: { in: ["DRAFT", "CERTIFIED", "ACTIVE"] },
      },
    },
    select: { key: true },
  });
  const allowed = new Set([...options.map((row) => row.key), ...existing.map((row) => row.key)]);
  return validateTeamOperationalTypeKeys({
    submittedKeys: input.operationalTypeKeys,
    allowedKeys: allowed,
  });
}

function mapTeamView(
  row: {
    id: string;
    facilityId: string;
    departmentId: string;
    displayName: string;
    description: string | null;
    displayOrder: number;
    status: "ACTIVE" | "ARCHIVED";
    archivedAt: Date | null;
    managerEmployeeId: string | null;
    managerEmployee: { firstName: string; lastName: string } | null;
    applicableOperationalTypeKeys?: string[];
    roomMemberships: Array<{
      spaceId: string;
      space: {
        name: string;
        isActive: boolean;
        unit: { name: string; hierarchyRole: string | null; parentUnit: { name: string } | null } | null;
        facilityRoomType: { displayName: string } | null;
      };
    }>;
  },
  allowedSpaceIds: ReadonlySet<string>,
  activeMemberCount = 0,
): DepartmentTeamView {
  const rooms: TeamRoomView[] = [];
  for (const membership of row.roomMemberships) {
    if (!membership.space.isActive) continue;
    if (!allowedSpaceIds.has(membership.spaceId)) continue;
    const parent = membership.space.unit;
    const floorName =
      parent?.hierarchyRole === "FLOOR"
        ? parent.name
        : parent?.parentUnit?.name ?? null;
    const neighborhoodName =
      parent && parent.hierarchyRole !== "FLOOR" ? parent.name : null;
    rooms.push({
      spaceId: membership.spaceId,
      name: membership.space.name,
      displayName: membership.space.name,
      floorName,
      neighborhoodName,
      roomTypeLabel: membership.space.facilityRoomType?.displayName ?? null,
    });
  }
  const manager = row.managerEmployee;
  return {
    id: row.id,
    facilityId: row.facilityId,
    departmentId: row.departmentId,
    displayName: row.displayName,
    description: row.description,
    displayOrder: row.displayOrder,
    status: row.status,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    managerEmployeeId: row.managerEmployeeId,
    managerLabel: manager ? `${manager.lastName}, ${manager.firstName}` : null,
    roomCount: rooms.length,
    activeMemberCount,
    rooms,
    applicableOperationalTypeKeys: [...(row.applicableOperationalTypeKeys ?? [])],
    cycles: [],
  };
}

const TEAM_INCLUDE = {
  managerEmployee: { select: { firstName: true, lastName: true } },
  roomMemberships: {
    include: {
      space: {
        select: {
          name: true,
          isActive: true,
          unit: {
            select: {
              name: true,
              hierarchyRole: true,
              parentUnit: { select: { name: true } },
            },
          },
          facilityRoomType: { select: { displayName: true } },
        },
      },
    },
  },
} as const;

async function loadActiveMemberCounts(
  client: DbClient,
  teamIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (teamIds.length === 0) return counts;
  const grouped = await client.employeeTeamMembership.groupBy({
    by: ["teamId"],
    where: {
      teamId: { in: [...teamIds] },
      employee: { status: "ACTIVE" },
    },
    _count: { employeeId: true },
  });
  for (const row of grouped) {
    counts.set(row.teamId, row._count.employeeId);
  }
  return counts;
}

export async function loadTeamsForDepartment(
  client: DbClient,
  input: { facilityId: string; departmentId: string; includeArchived?: boolean },
): Promise<DepartmentTeamView[]> {
  const [rows, allowed] = await Promise.all([
    client.departmentTeam.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        ...(input.includeArchived ? {} : { status: "ACTIVE" }),
      },
      include: TEAM_INCLUDE,
      orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
    }),
    loadAllowedTeamSpaceIds(client, input),
  ]);
  const memberCounts = await loadActiveMemberCounts(
    client,
    rows.map((row) => row.id),
  );
  const cyclesByTeam = await loadTeamCyclesForDepartment(client, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
  });
  return rows.map((row) => {
    const view = mapTeamView(row, allowed, memberCounts.get(row.id) ?? 0);
    return { ...view, cycles: cyclesByTeam.get(row.id) ?? [] };
  });
}

export async function loadTeamById(
  client: DbClient,
  input: { facilityId: string; teamId: string },
): Promise<DepartmentTeamView | null> {
  const row = await client.departmentTeam.findFirst({
    where: { id: input.teamId, facilityId: input.facilityId },
    include: TEAM_INCLUDE,
  });
  if (!row) return null;
  const [allowed, memberCounts] = await Promise.all([
    loadAllowedTeamSpaceIds(client, {
      facilityId: row.facilityId,
      departmentId: row.departmentId,
    }),
    loadActiveMemberCounts(client, [row.id]),
  ]);
  const view = mapTeamView(row, allowed, memberCounts.get(row.id) ?? 0);
  const cyclesByTeam = await loadTeamCyclesForDepartment(client, {
    facilityId: row.facilityId,
    departmentId: row.departmentId,
  });
  return { ...view, cycles: cyclesByTeam.get(row.id) ?? [] };
}

export async function loadTeamCatalog(input: {
  facilityId: string;
  departmentId: string;
}): Promise<TeamCatalog> {
  const [locationsView, facilityRoomTypes] = await Promise.all([
    loadDepartmentLocationsView({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    }),
    listFacilityRoomTypes(input.facilityId, prisma),
  ]);
  const locations = (locationsView?.locations ?? [])
    .filter((location) => location.kind === "room" && location.isActive)
    .map((location) => ({
      id: location.id,
      kind: "room" as const,
      name: location.displayName || location.name,
      roomTypeKey: location.roomTypeKey,
      roomTypeLabel: location.roomTypeLabel,
      facilityRoomTypeId: null as string | null,
      neighborhoodId: location.parentNeighborhoodId,
      neighborhoodName: location.parentNeighborhoodName,
      hierarchyRole: location.hierarchyRole,
      floorName: location.floorName,
    }));

  const roomIds = locations.map((row) => row.id);
  const spaceTypeRows =
    roomIds.length > 0
      ? await prisma.unitSpace.findMany({
          where: { id: { in: roomIds }, facilityId: input.facilityId },
          select: {
            id: true,
            facilityRoomTypeId: true,
            facilityRoomType: { select: { displayName: true } },
          },
        })
      : [];
  const typeBySpace = new Map(
    spaceTypeRows.map((row) => [
      row.id,
      {
        facilityRoomTypeId: row.facilityRoomTypeId,
        roomTypeLabel: row.facilityRoomType?.displayName ?? null,
      },
    ]),
  );

  const operationalTypes = await loadDepartmentOperationalTypeOptions({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    perspective: "working",
  });

  return {
    operationalTypes,
    locations: locations.map((location) => {
      const type = typeBySpace.get(location.id);
      return {
        ...location,
        facilityRoomTypeId: type?.facilityRoomTypeId ?? null,
        roomTypeLabel: type?.roomTypeLabel ?? location.roomTypeLabel,
      };
    }),
    roomTypes: facilityRoomTypes
      .filter((row) => row.isActive)
      .map((row) => ({ key: row.id, label: row.displayName })),
  };
}

export async function loadTeamEmployeeOptions(
  client: DbClient,
  input: { facilityId: string; departmentId: string },
): Promise<TeamEmployeeOption[]> {
  const employees = await client.employee.findMany({
    where: { facilityId: input.facilityId, status: { not: "TERMINATED" } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      facilityId: true,
      status: true,
      primaryDepartmentId: true,
      employeeDepartments: { select: { departmentId: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return employees.flatMap((employee) => {
    const decision = evaluateTeamManagerCandidate(
      {
        id: employee.id,
        facilityId: employee.facilityId,
        status: employee.status,
        primaryDepartmentId: employee.primaryDepartmentId,
        membershipDepartmentIds: employee.employeeDepartments.map((row) => row.departmentId),
      },
      { facilityId: input.facilityId, departmentId: input.departmentId },
    );
    if (!decision.ok) return [];
    return [
      {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        onRoster: employeeBelongsToDepartment(
          {
            primaryDepartmentId: employee.primaryDepartmentId,
            employeeDepartments: employee.employeeDepartments,
          },
          input.departmentId,
        ),
      },
    ];
  });
}

async function nextDisplayOrder(
  client: DbClient,
  departmentId: string,
): Promise<number> {
  const max = await client.departmentTeam.aggregate({
    where: { departmentId, status: "ACTIVE" },
    _max: { displayOrder: true },
  });
  return (max._max.displayOrder ?? 0) + 10;
}

export async function createDepartmentTeam(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    displayName: string;
    description?: string | null;
    managerEmployeeId?: string | null;
    spaceIds: readonly string[];
    operationalTypeKeys?: readonly string[];
  },
): Promise<DepartmentTeamView> {
  const authority = await resolveTeamAuthority(session, input.facilityId, input.departmentId);
  requireTeamManage(authority);

  const displayName = normalizeTeamDisplayName(input.displayName);
  const description = normalizeTeamDescription(input.description);

  return prisma.$transaction(async (tx) => {
    await assertActiveTeamNameAvailable(tx, {
      departmentId: input.departmentId,
      displayName,
    });
    const managerEmployeeId = await resolveManagerEmployeeId(tx, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      managerEmployeeId: input.managerEmployeeId ?? null,
    });
    const spaceIds = await resolveTeamRoomWrites(tx, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      spaceIds: input.spaceIds,
    });
    const operationalTypeKeys = await resolveTeamOperationalTypeWrites(tx, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      operationalTypeKeys: input.operationalTypeKeys ?? [],
    });
    const displayOrder = await nextDisplayOrder(tx, input.departmentId);
    const created = await tx.departmentTeam.create({
      data: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        displayName,
        description,
        displayOrder,
        managerEmployeeId,
        applicableOperationalTypeKeys: operationalTypeKeys,
        roomMemberships: {
          create: spaceIds.map((spaceId) => ({ spaceId })),
        },
      },
      select: { id: true },
    });
    const view = await loadTeamById(tx, { facilityId: input.facilityId, teamId: created.id });
    if (!view) throw new Error("Team created but could not be reloaded.");
    return view;
  });
}

export async function updateDepartmentTeam(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    teamId: string;
    displayName?: string;
    description?: string | null;
    managerEmployeeId?: string | null;
    spaceIds?: readonly string[];
    operationalTypeKeys?: readonly string[];
  },
): Promise<DepartmentTeamView> {
  const existing = await prisma.departmentTeam.findFirst({
    where: { id: input.teamId, facilityId: input.facilityId },
    select: { id: true, departmentId: true, facilityId: true, status: true },
  });
  if (!existing || existing.status === "ARCHIVED") {
    throw new Error("Team not found.");
  }
  const authority = await resolveTeamAuthority(session, existing.facilityId, existing.departmentId);
  requireTeamManage(authority);

  return prisma.$transaction(async (tx) => {
    const data: Prisma.DepartmentTeamUpdateInput = {};
    if (input.displayName !== undefined) {
      const displayName = normalizeTeamDisplayName(input.displayName);
      await assertActiveTeamNameAvailable(tx, {
        departmentId: existing.departmentId,
        displayName,
        excludeTeamId: existing.id,
      });
      data.displayName = displayName;
    }
    if (input.description !== undefined) {
      data.description = normalizeTeamDescription(input.description);
    }
    if (input.managerEmployeeId !== undefined) {
      const managerEmployeeId = await resolveManagerEmployeeId(tx, {
        facilityId: existing.facilityId,
        departmentId: existing.departmentId,
        managerEmployeeId: input.managerEmployeeId,
      });
      data.managerEmployee = managerEmployeeId
        ? { connect: { id: managerEmployeeId } }
        : { disconnect: true };
    }
    if (input.operationalTypeKeys !== undefined) {
      data.applicableOperationalTypeKeys = await resolveTeamOperationalTypeWrites(tx, {
        facilityId: existing.facilityId,
        departmentId: existing.departmentId,
        operationalTypeKeys: input.operationalTypeKeys,
      });
    }
    if (Object.keys(data).length > 0) {
      await tx.departmentTeam.update({ where: { id: existing.id }, data });
    }
    if (input.spaceIds) {
      const spaceIds = await resolveTeamRoomWrites(tx, {
        facilityId: existing.facilityId,
        departmentId: existing.departmentId,
        spaceIds: input.spaceIds,
      });
      await tx.departmentTeamRoomMembership.deleteMany({ where: { teamId: existing.id } });
      if (spaceIds.length > 0) {
        await tx.departmentTeamRoomMembership.createMany({
          data: spaceIds.map((spaceId) => ({ teamId: existing.id, spaceId })),
        });
      }
    }
    const view = await loadTeamById(tx, { facilityId: existing.facilityId, teamId: existing.id });
    if (!view) throw new Error("Team updated but could not be reloaded.");
    return view;
  });
}

export async function archiveDepartmentTeam(
  session: AppJwtPayload,
  input: { facilityId: string; teamId: string },
): Promise<void> {
  const existing = await prisma.departmentTeam.findFirst({
    where: { id: input.teamId, facilityId: input.facilityId },
    select: { id: true, departmentId: true, facilityId: true, status: true },
  });
  if (!existing) throw new Error("Team not found.");
  const authority = await resolveTeamAuthority(session, existing.facilityId, existing.departmentId);
  requireTeamManage(authority);
  if (existing.status === "ARCHIVED") return;
  await prisma.departmentTeam.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}

/**
 * When a Room leaves a Department's Facility Builder footprint, drop that Room
 * from every Team in that Department. Does not touch other Departments' Teams.
 */
export async function pruneTeamRoomsAfterResponsibilityRemoved(
  client: DbClient,
  input: { spaceId: string; departmentId: string },
): Promise<number> {
  const result = await client.departmentTeamRoomMembership.deleteMany({
    where: {
      spaceId: input.spaceId,
      team: { departmentId: input.departmentId },
    },
  });
  return result.count;
}

export function sessionMayViewDepartmentBuilderTeams(role: AppRole): boolean {
  return hasAtLeastRole(role, "MANAGER");
}
