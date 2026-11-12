import type { Prisma, PrismaClient } from "@prisma/client";

import { assertOneOperatorWorkforce } from "@/lib/department-authority/workforce-records";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export type DepartmentMembershipSource = {
  primaryDepartmentId: string | null | undefined;
  employeeDepartments?: ReadonlyArray<{ departmentId: string }>;
};

export type NormalizedDepartmentMembership = {
  primaryDepartmentId: string | null;
  additionalDepartmentIds: string[];
};

/** Employee belongs to a Department via primaryDepartmentId ∪ EmployeeDepartment. */
export function resolveDepartmentMembershipIds(
  employee: DepartmentMembershipSource,
): string[] {
  const ids = new Set<string>();
  if (employee.primaryDepartmentId) ids.add(employee.primaryDepartmentId);
  for (const row of employee.employeeDepartments ?? []) {
    if (row.departmentId) ids.add(row.departmentId);
  }
  return [...ids];
}

export function employeeBelongsToDepartment(
  employee: DepartmentMembershipSource,
  departmentId: string,
): boolean {
  return resolveDepartmentMembershipIds(employee).includes(departmentId);
}

/** Prisma filter matching canonical Department membership. */
export function employeeBelongsToDepartmentWhere(
  departmentId: string,
): Prisma.EmployeeWhereInput {
  return {
    OR: [
      { primaryDepartmentId: departmentId },
      { employeeDepartments: { some: { departmentId } } },
    ],
  };
}

/**
 * Primary is stored only on Employee.primaryDepartmentId.
 * Additional rows never duplicate the primary Department.
 */
export function normalizeDepartmentMembership(input: {
  primaryDepartmentId: string | null | undefined;
  additionalDepartmentIds?: readonly string[];
}): NormalizedDepartmentMembership {
  const primary =
    typeof input.primaryDepartmentId === "string" && input.primaryDepartmentId.trim()
      ? input.primaryDepartmentId.trim()
      : null;
  const additional: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.additionalDepartmentIds ?? []) {
    const id = raw.trim();
    if (!id || id === primary || seen.has(id)) continue;
    seen.add(id);
    additional.push(id);
  }
  return { primaryDepartmentId: primary, additionalDepartmentIds: additional };
}

export function departmentMembershipEquals(
  a: NormalizedDepartmentMembership,
  b: NormalizedDepartmentMembership,
): boolean {
  if (a.primaryDepartmentId !== b.primaryDepartmentId) return false;
  if (a.additionalDepartmentIds.length !== b.additionalDepartmentIds.length) return false;
  const bSet = new Set(b.additionalDepartmentIds);
  return a.additionalDepartmentIds.every((id) => bSet.has(id));
}

/** Serialize membership and operational qualification writes for this employee. */
export async function lockEmployeeMembership(
  tx: Prisma.TransactionClient,
  facilityId: string,
  employeeId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Employee" WHERE "facilityId" = ${facilityId} AND "id" = ${employeeId} FOR UPDATE
  `;
  if (rows.length === 0) throw new Error("Employee not found.");
}

export async function syncEmployeeDepartmentMembership(
  tx: DbClient,
  input: {
    employeeId: string;
    facilityId: string;
    primaryDepartmentId: string | null;
    additionalDepartmentIds: readonly string[];
  },
): Promise<{
  membership: NormalizedDepartmentMembership;
  removedDepartmentIds: string[];
  previous: NormalizedDepartmentMembership;
}> {
  if ("$transaction" in tx) {
    return tx.$transaction((transaction) => syncEmployeeDepartmentMembership(transaction, input));
  }

  await lockEmployeeMembership(tx, input.facilityId, input.employeeId);
  const membership = normalizeDepartmentMembership(input);
  const referenced = [
    ...(membership.primaryDepartmentId ? [membership.primaryDepartmentId] : []),
    ...membership.additionalDepartmentIds,
  ];

  if (referenced.length > 0) {
    const departments = await tx.department.findMany({
      where: { id: { in: referenced } },
      select: { id: true, facilityId: true, isActive: true },
    });
    if (departments.length !== referenced.length) {
      throw new Error("Department not found.");
    }
    for (const department of departments) {
      if (department.facilityId !== input.facilityId) {
        throw new Error("Department must belong to this facility.");
      }
      if (!department.isActive) {
        throw new Error("Department is not active.");
      }
    }
  }

  await assertOneOperatorWorkforce(tx, {
    facilityId: input.facilityId,
    departmentIds: referenced,
  });

  const existing = await tx.employee.findFirst({
    where: { id: input.employeeId, facilityId: input.facilityId },
    select: {
      primaryDepartmentId: true,
      employeeDepartments: { select: { departmentId: true } },
    },
  });
  if (!existing) {
    throw new Error("Employee not found.");
  }

  const previous = normalizeDepartmentMembership({
    primaryDepartmentId: existing.primaryDepartmentId,
    additionalDepartmentIds: existing.employeeDepartments.map((row) => row.departmentId),
  });
  const nextIds = new Set(referenced);
  const previousIds = resolveDepartmentMembershipIds(existing);
  const removedDepartmentIds = previousIds.filter((id) => !nextIds.has(id));

  await tx.employee.update({
    where: { id: input.employeeId },
    data: { primaryDepartmentId: membership.primaryDepartmentId },
  });

  await tx.employeeDepartment.deleteMany({
    where: {
      employeeId: input.employeeId,
      ...(membership.additionalDepartmentIds.length > 0
        ? { departmentId: { notIn: membership.additionalDepartmentIds } }
        : {}),
    },
  });

  if (membership.additionalDepartmentIds.length > 0) {
    await tx.employeeDepartment.createMany({
      data: membership.additionalDepartmentIds.map((departmentId) => ({
        employeeId: input.employeeId,
        departmentId,
      })),
      skipDuplicates: true,
    });
  }

  if (removedDepartmentIds.length > 0) {
    await tx.employeeOperationalRoleQualification.updateMany({
      where: {
        facilityId: input.facilityId,
        employeeId: input.employeeId,
        departmentId: { in: removedDepartmentIds },
        status: "ACTIVE",
      },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
  }

  return { membership, removedDepartmentIds, previous };
}
