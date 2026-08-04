import type { Prisma } from "@prisma/client";

/** Employee is “in” a department via primary assignment and/or floater membership. */
export function employeeBelongsToDepartmentWhere(departmentId: string): Prisma.EmployeeWhereInput {
  return {
    OR: [
      { primaryDepartmentId: departmentId },
      { employeeDepartments: { some: { departmentId } } },
    ],
  };
}
