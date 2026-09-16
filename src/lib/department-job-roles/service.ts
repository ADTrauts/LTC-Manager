/**
 * Department Job Roles — Department-owned operational roles with explicit capabilities.
 *
 * Build configuration only. Does not change RoleKey / route authorization / RUN yet.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import type { AppJwtPayload } from "@/lib/auth";
import { employeeBelongsToDepartment } from "@/lib/employee-membership/department";
import { prisma } from "@/lib/prisma";

import {
  decideJobRoleAuthority,
  requireJobRoleManage,
  type JobRoleAuthorityDecision,
} from "./authority";
import { normalizeCapabilityKeys, type OperationalCapabilityKey } from "./capabilities";
import {
  defaultCapabilitiesForTier,
  STARTER_JOB_ROLE_DEFINITIONS,
  type JobRoleTier,
} from "./tiers";
import {
  jobRoleNamesConflict,
  normalizeJobRoleDescription,
  normalizeJobRoleDisplayName,
  parseJobRoleTier,
} from "./validation";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export type DepartmentJobRoleView = {
  id: string;
  facilityId: string;
  departmentId: string;
  displayName: string;
  tier: JobRoleTier;
  description: string | null;
  displayOrder: number;
  status: "ACTIVE" | "ARCHIVED";
  capabilities: OperationalCapabilityKey[];
  employeeCount: number;
  archivedAt: string | null;
};

export async function resolveJobRoleAuthority(
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
): Promise<JobRoleAuthorityDecision> {
  if (session.facilityId !== facilityId) {
    return decideJobRoleAuthority({
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
  return decideJobRoleAuthority({
    role: session.role as AppRole,
    authMethod: session.authMethod,
    sessionFacilityId: session.facilityId,
    facilityId,
    departmentExists: Boolean(department),
  });
}

async function assertActiveJobRoleNameAvailable(
  client: DbClient,
  input: {
    departmentId: string;
    displayName: string;
    excludeRoleId?: string;
  },
): Promise<void> {
  const existing = await client.departmentJobRole.findMany({
    where: {
      departmentId: input.departmentId,
      status: "ACTIVE",
      ...(input.excludeRoleId ? { id: { not: input.excludeRoleId } } : {}),
    },
    select: { displayName: true },
  });
  if (existing.some((row) => jobRoleNamesConflict(row.displayName, input.displayName))) {
    throw new Error("An active Job Role with this name already exists in this Department.");
  }
}

function toView(
  row: {
    id: string;
    facilityId: string;
    departmentId: string;
    displayName: string;
    tier: JobRoleTier;
    description: string | null;
    displayOrder: number;
    status: "ACTIVE" | "ARCHIVED";
    capabilities: string[];
    archivedAt: Date | null;
    _count?: { assignments: number };
  },
): DepartmentJobRoleView {
  return {
    id: row.id,
    facilityId: row.facilityId,
    departmentId: row.departmentId,
    displayName: row.displayName,
    tier: row.tier,
    description: row.description,
    displayOrder: row.displayOrder,
    status: row.status,
    capabilities: normalizeCapabilityKeys(row.capabilities),
    employeeCount: row._count?.assignments ?? 0,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

/**
 * Ensure a Department has the generic starter Job Roles when none are ACTIVE yet.
 * Idempotent: does nothing when any ACTIVE role already exists.
 * No-op when the Department is missing or inactive.
 */
export async function ensureStarterJobRolesForDepartment(
  client: DbClient,
  input: { facilityId: string; departmentId: string },
): Promise<void> {
  const department = await client.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
    select: { id: true },
  });
  if (!department) {
    return;
  }

  const activeCount = await client.departmentJobRole.count({
    where: { departmentId: input.departmentId, facilityId: input.facilityId, status: "ACTIVE" },
  });
  if (activeCount > 0) return;

  for (const starter of STARTER_JOB_ROLE_DEFINITIONS) {
    await client.departmentJobRole.create({
      data: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        displayName: starter.displayName,
        tier: starter.tier,
        description: starter.description,
        displayOrder: starter.displayOrder,
        status: "ACTIVE",
        capabilities: defaultCapabilitiesForTier(starter.tier),
      },
    });
  }
}

export async function loadJobRolesForDepartment(
  client: DbClient,
  input: { facilityId: string; departmentId: string; includeArchived?: boolean },
): Promise<DepartmentJobRoleView[]> {
  await ensureStarterJobRolesForDepartment(client, input);

  const rows = await client.departmentJobRole.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      ...(input.includeArchived ? {} : { status: "ACTIVE" }),
    },
    orderBy: [{ status: "asc" }, { displayOrder: "asc" }, { displayName: "asc" }],
    include: { _count: { select: { assignments: true } } },
  });
  return rows.map((row) => toView(row));
}

export async function loadActiveJobRolesForFacilityDepartments(
  client: DbClient,
  input: { facilityId: string; departmentIds: readonly string[] },
): Promise<
  {
    id: string;
    displayName: string;
    departmentId: string;
    tier: JobRoleTier;
    status: "ACTIVE" | "ARCHIVED";
  }[]
> {
  if (input.departmentIds.length === 0) return [];
  for (const departmentId of input.departmentIds) {
    await ensureStarterJobRolesForDepartment(client, {
      facilityId: input.facilityId,
      departmentId,
    });
  }
  return client.departmentJobRole.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: { in: [...input.departmentIds] },
      status: "ACTIVE",
    },
    orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
    select: {
      id: true,
      displayName: true,
      departmentId: true,
      tier: true,
      status: true,
    },
  });
}

export async function createDepartmentJobRole(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    displayName: unknown;
    tier: unknown;
    description?: unknown;
    capabilities?: readonly string[];
  },
): Promise<DepartmentJobRoleView> {
  if (!input.departmentId?.trim()) {
    throw new Error("Select a Department to manage its Job Roles.");
  }
  const authority = await resolveJobRoleAuthority(session, input.facilityId, input.departmentId);
  requireJobRoleManage(authority);

  const displayName = normalizeJobRoleDisplayName(input.displayName);
  const tier = parseJobRoleTier(input.tier);
  const description = normalizeJobRoleDescription(input.description);
  const capabilities =
    input.capabilities !== undefined
      ? normalizeCapabilityKeys(input.capabilities)
      : defaultCapabilitiesForTier(tier);

  return prisma.$transaction(async (tx) => {
    await assertActiveJobRoleNameAvailable(tx, {
      departmentId: input.departmentId,
      displayName,
    });
    const maxOrder = await tx.departmentJobRole.aggregate({
      where: { departmentId: input.departmentId, status: "ACTIVE" },
      _max: { displayOrder: true },
    });
    const row = await tx.departmentJobRole.create({
      data: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        displayName,
        tier,
        description,
        displayOrder: (maxOrder._max.displayOrder ?? 0) + 100,
        status: "ACTIVE",
        capabilities,
      },
      include: { _count: { select: { assignments: true } } },
    });
    return toView(row);
  });
}

export async function updateDepartmentJobRole(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    roleId: string;
    displayName: unknown;
    tier: unknown;
    description?: unknown;
    capabilities: readonly string[];
  },
): Promise<DepartmentJobRoleView> {
  const existing = await prisma.departmentJobRole.findFirst({
    where: { id: input.roleId, facilityId: input.facilityId },
    select: { id: true, departmentId: true, status: true },
  });
  if (!existing) {
    throw new Error("Job Role not found.");
  }
  if (existing.status !== "ACTIVE") {
    throw new Error("Archived Job Roles cannot be edited. Restore is not available in this release.");
  }

  const authority = await resolveJobRoleAuthority(session, input.facilityId, existing.departmentId);
  requireJobRoleManage(authority);

  const displayName = normalizeJobRoleDisplayName(input.displayName);
  const tier = parseJobRoleTier(input.tier);
  const description = normalizeJobRoleDescription(input.description);
  const capabilities = normalizeCapabilityKeys(input.capabilities);

  return prisma.$transaction(async (tx) => {
    await assertActiveJobRoleNameAvailable(tx, {
      departmentId: existing.departmentId,
      displayName,
      excludeRoleId: existing.id,
    });
    const row = await tx.departmentJobRole.update({
      where: { id: existing.id },
      data: {
        displayName,
        tier,
        description,
        capabilities,
      },
      include: { _count: { select: { assignments: true } } },
    });
    return toView(row);
  });
}

export async function archiveDepartmentJobRole(
  session: AppJwtPayload,
  input: { facilityId: string; roleId: string },
): Promise<void> {
  const existing = await prisma.departmentJobRole.findFirst({
    where: { id: input.roleId, facilityId: input.facilityId },
    select: { id: true, departmentId: true, status: true },
  });
  if (!existing) {
    throw new Error("Job Role not found.");
  }
  if (existing.status === "ARCHIVED") return;

  const authority = await resolveJobRoleAuthority(session, input.facilityId, existing.departmentId);
  requireJobRoleManage(authority);

  await prisma.departmentJobRole.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}

/**
 * Assign or clear one Job Role per Employee+Department.
 * Requires Department membership. Archived roles cannot be newly assigned.
 */
export async function syncEmployeeDepartmentJobRoles(
  tx: DbClient,
  input: {
    employeeId: string;
    facilityId: string;
    /** departmentId → jobRoleId | null (null clears) */
    assignments: ReadonlyMap<string, string | null>;
  },
): Promise<void> {
  if (input.assignments.size === 0) return;

  const employee = await tx.employee.findFirst({
    where: { id: input.employeeId, facilityId: input.facilityId },
    select: {
      id: true,
      primaryDepartmentId: true,
      employeeDepartments: { select: { departmentId: true } },
    },
  });
  if (!employee) {
    throw new Error("Employee not found.");
  }

  const roleIds = [...input.assignments.values()].filter((id): id is string => Boolean(id));
  const roles =
    roleIds.length > 0
      ? await tx.departmentJobRole.findMany({
          where: { id: { in: roleIds }, facilityId: input.facilityId },
          select: { id: true, departmentId: true, status: true, facilityId: true },
        })
      : [];
  const roleById = new Map(roles.map((role) => [role.id, role]));

  for (const [departmentId, jobRoleId] of input.assignments) {
    if (!employeeBelongsToDepartment(employee, departmentId)) {
      throw new Error("Job Role assignment requires Department membership.");
    }

    if (!jobRoleId) {
      await tx.employeeDepartmentJobRole.deleteMany({
        where: { employeeId: input.employeeId, departmentId },
      });
      continue;
    }

    const role = roleById.get(jobRoleId);
    if (!role) {
      throw new Error("Job Role not found.");
    }
    if (role.facilityId !== input.facilityId) {
      throw new Error("Cross-facility Job Role assignment rejected.");
    }
    if (role.departmentId !== departmentId) {
      throw new Error("Job Role must belong to the selected Department.");
    }

    const existing = await tx.employeeDepartmentJobRole.findUnique({
      where: {
        employeeId_departmentId: { employeeId: input.employeeId, departmentId },
      },
      select: { id: true, jobRoleId: true },
    });

    if (role.status !== "ACTIVE" && existing?.jobRoleId !== jobRoleId) {
      throw new Error("Archived Job Roles cannot be newly assigned.");
    }

    await tx.employeeDepartmentJobRole.upsert({
      where: {
        employeeId_departmentId: { employeeId: input.employeeId, departmentId },
      },
      create: {
        employeeId: input.employeeId,
        departmentId,
        jobRoleId,
      },
      update: { jobRoleId },
    });
  }
}

/** Remove Job Role assignments for Departments the employee no longer belongs to. */
export async function reconcileJobRolesAfterDepartmentRemoval(
  tx: DbClient,
  input: { employeeId: string; removedDepartmentIds: readonly string[] },
): Promise<void> {
  if (input.removedDepartmentIds.length === 0) return;
  await tx.employeeDepartmentJobRole.deleteMany({
    where: {
      employeeId: input.employeeId,
      departmentId: { in: [...input.removedDepartmentIds] },
    },
  });
}

export function sessionMayManageJobRoles(session: AppJwtPayload): boolean {
  return (
    session.authMethod !== "QUICK_PIN" && hasAtLeastRole(session.role as AppRole, "MANAGER")
  );
}
