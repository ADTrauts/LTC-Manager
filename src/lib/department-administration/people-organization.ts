import type { Prisma, PrismaClient } from "@prisma/client";

import { employeeBelongsToDepartmentWhere } from "@/lib/employee-membership";
import { getRoleDefinition, getRolesForDepartment } from "@/lib/scheduling/assignment-roles";
import { loadTeamsForDepartment } from "@/lib/department-teams";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type DepartmentPeopleTeamSummary = {
  id: string;
  name: string;
  leadName: string | null;
  memberCount: number;
};

export type DepartmentQualificationSummary = {
  roleKey: string;
  roleLabel: string;
  activeCount: number;
};

export type DepartmentPeopleOrganization = {
  departmentId: string;
  departmentName: string;
  headName: string | null;
  employeeCount: number;
  teamCount: number;
  teams: DepartmentPeopleTeamSummary[];
  unteamedCount: number;
  qualificationCounts: DepartmentQualificationSummary[];
  unqualifiedCount: number;
};

export async function loadDepartmentPeopleOrganization(
  client: DbClient,
  input: { facilityId: string; departmentId: string },
): Promise<DepartmentPeopleOrganization | null> {
  const department = await client.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
    select: {
      id: true,
      name: true,
      key: true,
      headEmployee: { select: { firstName: true, lastName: true } },
    },
  });
  if (!department) return null;

  const [teams, members] = await Promise.all([
    loadTeamsForDepartment(client, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    }),
    client.employee.findMany({
      where: {
        facilityId: input.facilityId,
        status: "ACTIVE",
        ...employeeBelongsToDepartmentWhere(input.departmentId),
      },
      select: {
        id: true,
        teamMemberships: {
          where: { team: { departmentId: input.departmentId, status: "ACTIVE" } },
          select: { teamId: true },
        },
        operationalRoleQualifications: {
          where: { departmentId: input.departmentId, status: "ACTIVE" },
          select: { roleKey: true },
        },
      },
    }),
  ]);

  const counts = new Map<string, number>();
  let unqualifiedCount = 0;
  let unteamedCount = 0;
  for (const member of members) {
    if (member.teamMemberships.length === 0) unteamedCount += 1;
    if (member.operationalRoleQualifications.length === 0) unqualifiedCount += 1;
    const seen = new Set<string>();
    for (const qualification of member.operationalRoleQualifications) {
      if (seen.has(qualification.roleKey)) continue;
      seen.add(qualification.roleKey);
      counts.set(qualification.roleKey, (counts.get(qualification.roleKey) ?? 0) + 1);
    }
  }

  const qualificationCounts = getRolesForDepartment(department.key).map((role) => ({
    roleKey: role.key,
    roleLabel: role.label,
    activeCount: counts.get(role.key) ?? 0,
  }));
  for (const [roleKey, activeCount] of counts) {
    if (qualificationCounts.some((row) => row.roleKey === roleKey)) continue;
    qualificationCounts.push({
      roleKey,
      roleLabel: getRoleDefinition(roleKey)?.label ?? roleKey,
      activeCount,
    });
  }

  const head = department.headEmployee;
  return {
    departmentId: department.id,
    departmentName: department.name,
    headName: head ? `${head.firstName} ${head.lastName}`.trim() : null,
    employeeCount: members.length,
    teamCount: teams.length,
    teams: teams.map((team) => ({
      id: team.id,
      name: team.displayName,
      leadName: team.managerLabel,
      memberCount: team.activeMemberCount,
    })),
    unteamedCount,
    qualificationCounts,
    unqualifiedCount,
  };
}
