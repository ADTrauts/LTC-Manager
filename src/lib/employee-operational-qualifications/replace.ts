import type { Prisma, PrismaClient } from "@prisma/client";

import { employeeBelongsToDepartment, lockEmployeeMembership } from "@/lib/employee-membership/department";

import { assertQualificationSelection, planQualificationWrites } from "./eligibility";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Replace today's operational eligibility for one Employee in one Department.
 */
export async function replaceEmployeeOperationalQualifications(
  db: Db,
  input: {
    facilityId: string;
    employeeId: string;
    departmentId: string;
    roleKeys: readonly string[];
  },
): Promise<string[]> {
  if ("$transaction" in db) {
    return db.$transaction((tx) => replaceEmployeeOperationalQualifications(tx, input));
  }

  await lockEmployeeMembership(db, input.facilityId, input.employeeId);
  const employee = await db.employee.findFirst({
    where: { id: input.employeeId, facilityId: input.facilityId },
    select: {
      id: true,
      primaryDepartmentId: true,
      employeeDepartments: { select: { departmentId: true } },
    },
  });
  if (!employee) throw new Error("Employee not found.");

  const department = await db.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
    select: { id: true, key: true },
  });
  if (!department) throw new Error("Department not found.");

  const desired = assertQualificationSelection({
    isDepartmentMember: employeeBelongsToDepartment(employee, department.id),
    departmentKey: department.key,
    roleKeys: input.roleKeys,
  });

  const existing = await db.employeeOperationalRoleQualification.findMany({
    where: {
      facilityId: input.facilityId,
      employeeId: employee.id,
      departmentId: department.id,
    },
    select: { roleKey: true, status: true },
  });
  const plan = planQualificationWrites({ existing, desiredRoleKeys: desired });
  const now = new Date();

  if (plan.create.length > 0) {
    await db.employeeOperationalRoleQualification.createMany({
      data: plan.create.map((roleKey) => ({
        facilityId: input.facilityId,
        employeeId: employee.id,
        departmentId: department.id,
        roleKey,
        status: "ACTIVE" as const,
      })),
    });
  }
  if (plan.activate.length > 0) {
    await db.employeeOperationalRoleQualification.updateMany({
      where: {
        employeeId: employee.id,
        departmentId: department.id,
        roleKey: { in: plan.activate },
      },
      data: { status: "ACTIVE", revokedAt: null },
    });
  }
  if (plan.revoke.length > 0) {
    await db.employeeOperationalRoleQualification.updateMany({
      where: {
        employeeId: employee.id,
        departmentId: department.id,
        roleKey: { in: plan.revoke },
        status: "ACTIVE",
      },
      data: { status: "REVOKED", revokedAt: now },
    });
  }

  return desired;
}
