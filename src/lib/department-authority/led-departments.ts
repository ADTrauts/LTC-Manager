import { RoleKey, type Prisma, type PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Departments a person leads: the recorded head link, or GM role on the primary Department.
 * `canManageDepartmentHeadSettings` and the Dashboard Viewer Context both use this rule.
 */
export function deriveLedDepartmentIds(input: {
  headedDepartmentIds: readonly string[];
  roleType: RoleKey | null | undefined;
  primaryDepartmentId: string | null | undefined;
}): string[] {
  const ids = new Set(input.headedDepartmentIds);
  if (input.roleType === RoleKey.GM && input.primaryDepartmentId) {
    ids.add(input.primaryDepartmentId);
  }
  return [...ids];
}

export async function resolveLedDepartmentIds(
  db: DbClient,
  input: { facilityId: string; employeeId: string },
): Promise<string[]> {
  const [employee, headed] = await Promise.all([
    db.employee.findFirst({
      where: { id: input.employeeId, facilityId: input.facilityId },
      select: { roleType: true, primaryDepartmentId: true },
    }),
    db.department.findMany({
      where: { facilityId: input.facilityId, headEmployeeId: input.employeeId },
      select: { id: true },
    }),
  ]);
  return deriveLedDepartmentIds({
    headedDepartmentIds: headed.map((row) => row.id),
    roleType: employee?.roleType,
    primaryDepartmentId: employee?.primaryDepartmentId,
  });
}
