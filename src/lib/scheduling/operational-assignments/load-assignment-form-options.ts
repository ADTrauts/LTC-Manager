import { prisma } from "@/lib/prisma";
import { getRolesForDepartment, type OperationalRoleDefinition } from "@/lib/scheduling/assignment-roles";

export type AssignmentFormOptions = {
  employees: { id: string; firstName: string; lastName: string }[];
  roles: OperationalRoleDefinition[];
  units: { id: string; name: string }[];
  operations: { id: string; label: string }[];
};

export async function loadAssignmentFormOptions(input: {
  facilityId: string;
  departmentId: string;
  departmentKey: string;
  serviceDate: string;
}): Promise<AssignmentFormOptions> {
  const dateStart = new Date(`${input.serviceDate}T00:00:00`);

  const [employees, units, operations] = await Promise.all([
    prisma.employee.findMany({
      where: {
        facilityId: input.facilityId,
        status: "ACTIVE",
        OR: [
          { primaryDepartmentId: input.departmentId },
          { employeeDepartments: { some: { departmentId: input.departmentId } } },
        ],
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.unit.findMany({
      where: { facilityId: input.facilityId, isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.operationInstance.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate: dateStart,
        status: { in: ["SCHEDULED", "PREPARATION", "EXECUTION"] },
      },
      orderBy: { scheduledStartLocal: "asc" },
      select: { id: true, label: true },
    }),
  ]);

  const roles = getRolesForDepartment(input.departmentKey);

  return { employees, roles, units, operations };
}
