import type { DepartmentTeamStatus, Prisma } from "@prisma/client";

import type { DbClient } from "./department";

export type TeamMembershipInput = {
  teamId: string;
  isPrimary: boolean;
};

export type TeamCatalogRow = {
  id: string;
  facilityId: string;
  departmentId: string;
  status: DepartmentTeamStatus | "ACTIVE" | "ARCHIVED";
};

export type NormalizedTeamMembership = {
  teamId: string;
  departmentId: string;
  isPrimary: boolean;
};

/**
 * Primary Team uniqueness is per employee per Department, not global.
 * Primary membership is represented by isPrimary on the membership row itself.
 */
export function evaluateTeamMembershipSubmission(input: {
  facilityId: string;
  departmentIds: ReadonlySet<string>;
  teamsById: ReadonlyMap<string, TeamCatalogRow>;
  memberships: readonly TeamMembershipInput[];
}): { ok: true; rows: NormalizedTeamMembership[] } | { ok: false; reason: string } {
  const byTeam = new Map<string, boolean>();
  for (const row of input.memberships) {
    const teamId = row.teamId.trim();
    if (!teamId) continue;
    byTeam.set(teamId, Boolean(row.isPrimary) || byTeam.get(teamId) === true);
  }

  const rows: NormalizedTeamMembership[] = [];
  const primaryByDepartment = new Map<string, string>();

  for (const [teamId, isPrimary] of byTeam) {
    const team = input.teamsById.get(teamId);
    if (!team) {
      return { ok: false, reason: "Team not found." };
    }
    if (team.facilityId !== input.facilityId) {
      return { ok: false, reason: "Team must belong to this facility." };
    }
    if (team.status !== "ACTIVE") {
      return { ok: false, reason: "Cannot assign an archived Team." };
    }
    if (!input.departmentIds.has(team.departmentId)) {
      return {
        ok: false,
        reason: "Employee must belong to the Team's Department before joining the Team.",
      };
    }
    if (isPrimary) {
      const existingPrimary = primaryByDepartment.get(team.departmentId);
      if (existingPrimary && existingPrimary !== teamId) {
        return { ok: false, reason: "An employee may have only one Primary Team per Department." };
      }
      primaryByDepartment.set(team.departmentId, teamId);
    }
    rows.push({ teamId, departmentId: team.departmentId, isPrimary });
  }

  return { ok: true, rows };
}

export function employeeBelongsToTeamWhere(teamId: string): Prisma.EmployeeWhereInput {
  return { teamMemberships: { some: { teamId } } };
}

export async function syncEmployeeTeamMembership(
  tx: DbClient,
  input: {
    employeeId: string;
    facilityId: string;
    departmentIds: ReadonlySet<string>;
    memberships: readonly TeamMembershipInput[];
  },
): Promise<{ rows: NormalizedTeamMembership[] }> {
  const submittedIds = [
    ...new Set(input.memberships.map((row) => row.teamId.trim()).filter(Boolean)),
  ];
  const submittedTeams =
    submittedIds.length > 0
      ? await tx.departmentTeam.findMany({
          where: { id: { in: submittedIds } },
          select: { id: true, facilityId: true, departmentId: true, status: true },
        })
      : [];
  const teamsById = new Map(submittedTeams.map((team) => [team.id, team]));
  const evaluated = evaluateTeamMembershipSubmission({
    facilityId: input.facilityId,
    departmentIds: input.departmentIds,
    teamsById,
    memberships: input.memberships,
  });
  if (!evaluated.ok) {
    throw new Error(evaluated.reason);
  }

  const keepTeamIds = new Set(evaluated.rows.map((row) => row.teamId));

  if (input.departmentIds.size === 0) {
    await tx.employeeTeamMembership.deleteMany({ where: { employeeId: input.employeeId } });
  } else {
    await tx.employeeTeamMembership.deleteMany({
      where: {
        employeeId: input.employeeId,
        OR: [
          { team: { departmentId: { notIn: [...input.departmentIds] } } },
          keepTeamIds.size === 0
            ? { team: { status: "ACTIVE" } }
            : { team: { status: "ACTIVE" }, teamId: { notIn: [...keepTeamIds] } },
        ],
      },
    });
  }

  for (const row of evaluated.rows) {
    await tx.employeeTeamMembership.upsert({
      where: {
        employeeId_teamId: { employeeId: input.employeeId, teamId: row.teamId },
      },
      create: {
        employeeId: input.employeeId,
        teamId: row.teamId,
        isPrimary: row.isPrimary,
      },
      update: { isPrimary: row.isPrimary },
    });
  }

  return { rows: evaluated.rows };
}

export function formatTeamMembershipAuditValue(
  rows: ReadonlyArray<{ teamId: string; isPrimary: boolean }>,
): string | null {
  if (rows.length === 0) return null;
  return [...rows]
    .map((row) => `${row.teamId}:${row.isPrimary ? "primary" : "additional"}`)
    .sort()
    .join(",");
}
