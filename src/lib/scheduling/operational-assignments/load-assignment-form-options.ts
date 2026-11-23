import { prisma } from "@/lib/prisma";
import { getRolesForDepartment, type OperationalRoleDefinition } from "@/lib/scheduling/assignment-roles";
import { formatRoomDisplayName } from "@/lib/facility-builder/load-facility-hierarchy";

export type AssignmentFormSpaceOption = {
  id: string;
  label: string;
  unitId: string | null;
  unitName: string | null;
  roomNumber: string | null;
  sortOrder: number;
};

export type AssignmentFormOptions = {
  employees: { id: string; firstName: string; lastName: string }[];
  roles: OperationalRoleDefinition[];
  units: { id: string; name: string }[];
  spaces: AssignmentFormSpaceOption[];
};

export async function loadAssignmentFormOptions(input: {
  facilityId: string;
  departmentId: string;
  departmentKey: string;
}): Promise<AssignmentFormOptions> {
  const [employees, units, spaces] = await Promise.all([
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
    input.departmentKey === "EVS"
      ? prisma.unitSpace.findMany({
          where: {
            facilityId: input.facilityId,
            isActive: true,
            responsibilities: { some: { departmentId: input.departmentId } },
          },
          orderBy: [{ sortOrder: "asc" }, { roomNumber: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            roomNumber: true,
            unitId: true,
            sortOrder: true,
            unit: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const roles = getRolesForDepartment(input.departmentKey);

  return {
    employees,
    roles,
    units,
    spaces: spaces.map((s) => ({
      id: s.id,
      label: formatRoomDisplayName(s),
      unitId: s.unitId,
      unitName: s.unit?.name ?? null,
      roomNumber: s.roomNumber,
      sortOrder: s.sortOrder,
    })),
  };
}
