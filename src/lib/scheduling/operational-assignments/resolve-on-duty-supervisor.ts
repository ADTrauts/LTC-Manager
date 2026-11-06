import type { Prisma, PrismaClient } from "@prisma/client";

import { calledOffShiftCoversInstant } from "@/lib/scheduling/call-off-window";
import {
  facilityLocalDateToServiceDate,
  loadFacilityTimezone,
} from "@/lib/operational-time";

import {
  selectOnDutySupervisors,
  serviceDateWindow,
  supervisoryResponsibilityRoleKey,
  type OnDutyLocationGraph,
  type OnDutySupervisorCandidate,
  type OnDutySupervisorResponsibility,
} from "./on-duty-supervisor";

type Db = PrismaClient | Prisma.TransactionClient;

export type ResolveOnDutySupervisorInput = {
  facilityId: string;
  departmentId: string;
  serviceDate: string;
  at: Date;
  unitId?: string | null;
  spaceId?: string | null;
};

/**
 * Who is assigned to supervise this Department and location at this instant.
 * Returns Employees. It does not return Users and it does not read authority roles.
 */
export async function resolveOnDutySupervisorResponsibility(
  db: Db,
  input: ResolveOnDutySupervisorInput,
): Promise<OnDutySupervisorResponsibility> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.serviceDate)) {
    return { status: "not_applicable", reason: "invalid_service_date" };
  }
  const department = await db.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId },
    select: { id: true, key: true },
  });
  if (!department) return { status: "not_applicable", reason: "department_not_in_facility" };

  const roleKey = supervisoryResponsibilityRoleKey(department.key);
  if (!roleKey) return { status: "not_applicable", reason: "supervisory_responsibility_not_defined" };

  const timeZone = await loadFacilityTimezone(db, input.facilityId);
  const day = serviceDateWindow(input.serviceDate, timeZone);
  if (!day) return { status: "not_applicable", reason: "invalid_service_date" };

  const serviceDate = facilityLocalDateToServiceDate(input.serviceDate);
  const [assignments, units, callOffs] = await Promise.all([
    db.operationalAssignment.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: department.id,
        serviceDate,
        roleKey,
        status: { in: ["PLANNED", "ACTIVE"] },
      },
      select: {
        id: true,
        employeeId: true,
        roleKey: true,
        status: true,
        startsAt: true,
        endsAt: true,
        unitId: true,
        locations: { select: { unitSpaceId: true } },
      },
    }),
    db.unit.findMany({
      where: { facilityId: input.facilityId },
      select: { id: true, parentUnitId: true },
    }),
    db.scheduleEntry.findMany({
      where: {
        calledOffAt: { not: null },
        date: serviceDate,
        employee: { facilityId: input.facilityId },
      },
      select: {
        employeeId: true,
        plannedStart: true,
        plannedEnd: true,
      },
    }),
  ]);

  const spaceIds = new Set<string>();
  if (input.spaceId) spaceIds.add(input.spaceId);
  for (const assignment of assignments) {
    for (const location of assignment.locations) spaceIds.add(location.unitSpaceId);
  }
  const spaces =
    spaceIds.size === 0
      ? []
      : await db.unitSpace.findMany({
          where: { facilityId: input.facilityId, id: { in: [...spaceIds] } },
          select: { id: true, unitId: true },
        });

  const graph: OnDutyLocationGraph = {
    parentByUnitId: new Map(units.map((unit) => [unit.id, unit.parentUnitId])),
    unitIdBySpaceId: new Map(spaces.map((space) => [space.id, space.unitId])),
  };
  const candidates: OnDutySupervisorCandidate[] = assignments.map((assignment) => ({
    assignmentId: assignment.id,
    employeeId: assignment.employeeId,
    roleKey: assignment.roleKey,
    status: assignment.status,
    startsAt: assignment.startsAt,
    endsAt: assignment.endsAt,
    unitId: assignment.unitId,
    spaceIds: assignment.locations.map((location) => location.unitSpaceId),
  }));
  const calledOffEmployeeIds = new Set(
    callOffs
      .filter((entry) =>
        calledOffShiftCoversInstant({
          plannedStart: entry.plannedStart,
          plannedEnd: entry.plannedEnd,
          serviceDateKey: input.serviceDate,
          at: input.at,
          timeZone,
        }),
      )
      .map((entry) => entry.employeeId),
  );

  return selectOnDutySupervisors({
    roleKey,
    at: input.at,
    day,
    unitId: input.unitId,
    spaceId: input.spaceId,
    candidates,
    calledOffEmployeeIds,
    graph,
  });
}

