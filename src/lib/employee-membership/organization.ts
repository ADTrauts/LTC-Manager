import {
  reconcileJobRolesAfterDepartmentRemoval,
  syncEmployeeDepartmentJobRoles,
} from "@/lib/department-job-roles";

import type { DbClient } from "./department";
import {
  resolveDepartmentMembershipIds,
  syncEmployeeDepartmentMembership,
} from "./department";
import {
  formatTeamMembershipAuditValue,
  syncEmployeeTeamMembership,
  type TeamMembershipInput,
} from "./team";

export async function resolveFacilityJobTitleId(
  tx: DbClient,
  input: { facilityId: string; jobTitleId: string | null },
): Promise<string | null> {
  if (!input.jobTitleId) return null;
  const title = await tx.jobTitle.findFirst({
    where: { id: input.jobTitleId, facilityId: input.facilityId, isActive: true },
    select: { id: true },
  });
  if (!title) {
    throw new Error("Job Title not found.");
  }
  return title.id;
}

/**
 * Atomically persist Department membership, Team membership, Job Title, and Job Roles.
 * Does not write RoleKey, WorkStations, Unit access, or daily assignments.
 */
export async function syncEmployeeOrganization(
  tx: DbClient,
  input: {
    employeeId: string;
    facilityId: string;
    primaryDepartmentId: string | null;
    additionalDepartmentIds: readonly string[];
    jobTitleId: string | null;
    teamMemberships: readonly TeamMembershipInput[];
    /** departmentId → jobRoleId | null. Omitted departments leave existing assignments untouched (except removed memberships). */
    jobRoleByDepartmentId?: ReadonlyMap<string, string | null>;
  },
): Promise<{
  primaryDepartmentId: string | null;
  additionalDepartmentIds: string[];
  jobTitleId: string | null;
  teamAuditValue: string | null;
}> {
  const jobTitleId = await resolveFacilityJobTitleId(tx, {
    facilityId: input.facilityId,
    jobTitleId: input.jobTitleId,
  });

  const { membership, removedDepartmentIds } = await syncEmployeeDepartmentMembership(tx, {
    employeeId: input.employeeId,
    facilityId: input.facilityId,
    primaryDepartmentId: input.primaryDepartmentId,
    additionalDepartmentIds: input.additionalDepartmentIds,
  });

  await reconcileJobRolesAfterDepartmentRemoval(tx, {
    employeeId: input.employeeId,
    removedDepartmentIds,
  });

  const departmentIds = new Set(
    resolveDepartmentMembershipIds({
      primaryDepartmentId: membership.primaryDepartmentId,
      employeeDepartments: membership.additionalDepartmentIds.map((departmentId) => ({
        departmentId,
      })),
    }),
  );

  const teams = await syncEmployeeTeamMembership(tx, {
    employeeId: input.employeeId,
    facilityId: input.facilityId,
    departmentIds,
    memberships: input.teamMemberships,
  });

  if (input.jobRoleByDepartmentId && input.jobRoleByDepartmentId.size > 0) {
    const scoped = new Map<string, string | null>();
    for (const [departmentId, jobRoleId] of input.jobRoleByDepartmentId) {
      if (departmentIds.has(departmentId)) {
        scoped.set(departmentId, jobRoleId);
      }
    }
    await syncEmployeeDepartmentJobRoles(tx, {
      employeeId: input.employeeId,
      facilityId: input.facilityId,
      assignments: scoped,
    });
  }

  await tx.employee.update({
    where: { id: input.employeeId },
    data: { jobTitleId },
  });

  return {
    primaryDepartmentId: membership.primaryDepartmentId,
    additionalDepartmentIds: membership.additionalDepartmentIds,
    jobTitleId,
    teamAuditValue: formatTeamMembershipAuditValue(teams.rows),
  };
}
