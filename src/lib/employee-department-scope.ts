import type { Prisma } from "@prisma/client";

import { employeeBelongsToDepartmentWhere as canonicalWhere } from "@/lib/employee-membership";

/** Employee is in a Department via primary assignment and/or additional membership. */
export function employeeBelongsToDepartmentWhere(
  departmentId: string,
): Prisma.EmployeeWhereInput {
  return canonicalWhere(departmentId);
}
