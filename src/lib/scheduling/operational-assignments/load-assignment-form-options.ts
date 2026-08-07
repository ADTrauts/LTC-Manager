import { prisma } from "@/lib/prisma";
import { getRolesForDepartment, type OperationalRoleDefinition } from "@/lib/scheduling/assignment-roles";
import { formatRoomDisplayName } from "@/lib/facility-builder/load-facility-hierarchy";
import { loadZonesForDepartment } from "@/lib/department-zones";

export type AssignmentFormSpaceOption = {
  id: string;
  label: string;
  unitId: string | null;
  unitName: string | null;
  roomNumber: string | null;
  sortOrder: number;
};

export type AssignmentFormZoneOption = {
  id: string;
  name: string;
  locationCount: number;
  unitSpaceIds: string[];
};

export type AssignmentFormOptions = {
  employees: { id: string; firstName: string; lastName: string }[];
  roles: OperationalRoleDefinition[];
  units: { id: string; name: string }[];
  operations: { id: string; label: string }[];
  spaces: AssignmentFormSpaceOption[];
  zones: AssignmentFormZoneOption[];
};

export async function loadAssignmentFormOptions(input: {
  facilityId: string;
  departmentId: string;
  departmentKey: string;
  serviceDate: string;
}): Promise<AssignmentFormOptions> {
  const dateStart = new Date(`${input.serviceDate}T00:00:00`);

  const [employees, units, operations, spaces, zones] = await Promise.all([
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
    input.departmentKey === "EVS"
      ? prisma.unitSpace.findMany({
          where: { facilityId: input.facilityId, isActive: true },
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
    input.departmentKey === "EVS"
      ? loadZonesForDepartment(prisma, {
          facilityId: input.facilityId,
          departmentId: input.departmentId,
          includeRetired: false,
        })
      : Promise.resolve([]),
  ]);

  const roles = getRolesForDepartment(input.departmentKey);

  return {
    employees,
    roles,
    units,
    operations,
    spaces: spaces.map((s) => ({
      id: s.id,
      label: formatRoomDisplayName(s),
      unitId: s.unitId,
      unitName: s.unit?.name ?? null,
      roomNumber: s.roomNumber,
      sortOrder: s.sortOrder,
    })),
    zones: zones
      .filter((z) => z.status === "ACTIVE" || z.status === "DRAFT")
      .map((z) => ({
        id: z.id,
        name: z.name,
        locationCount: z.locationCount,
        unitSpaceIds: z.locations.map((l) => l.unitSpaceId),
      })),
  };
}
