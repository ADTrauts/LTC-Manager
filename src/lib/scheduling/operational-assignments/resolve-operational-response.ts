import type { Prisma, PrismaClient } from "@prisma/client";

import { calledOffShiftCoversInstant } from "@/lib/scheduling/call-off-window";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

import { onCallCoverageRoleKey } from "./on-call-coverage";
import {
  selectOnDutySupervisors,
  serviceDateWindow,
  type OnDutyLocationGraph,
  type OnDutySupervisorCandidate,
  type OnDutySupervisorResponsibility,
} from "./on-duty-supervisor";

type Db = PrismaClient | Prisma.TransactionClient;

export type ResolveOperationalResponseInput = {
  facilityId: string;
  departmentId: string;
  at: Date;
  unitId?: string | null;
  spaceId?: string | null;
};

/**
 * Who must respond to an operational incident for this Department at this instant.
 * Returns Employees from the On-Call Coverage Assignment. It does not return Users,
 * read authority roles, or read Asset, Work Order, or supervisor-rounding rows.
 */
export async function resolveOperationalResponseResponsibility(
  db: Db,
  input: ResolveOperationalResponseInput,
): Promise<OnDutySupervisorResponsibility> {
  const department = await db.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId },
    select: { id: true, key: true },
  });
  if (!department) return { status: "not_applicable", reason: "department_not_in_facility" };

  const roleKey = onCallCoverageRoleKey(department.key);
  if (!roleKey) return { status: "not_applicable", reason: "on_call_coverage_not_defined" };

  const timeZone = await loadFacilityTimezone(db, input.facilityId);
  const serviceDate = toServiceDateKey(getFacilityServiceDate(timeZone, input.at));
  const day = serviceDateWindow(serviceDate, timeZone);
  if (!day) return { status: "not_applicable", reason: "invalid_service_date" };

  const previousKey = previousServiceDateKey(serviceDate);
  const serviceDates = [facilityLocalDateToServiceDate(serviceDate), facilityLocalDateToServiceDate(previousKey)];
  const [assignments, units, callOffs] = await Promise.all([
    db.operationalAssignment.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: department.id,
        serviceDate: { in: serviceDates },
        roleKey,
        status: { in: ["PLANNED", "ACTIVE"] },
      },
      select: {
        id: true,
        employeeId: true,
        roleKey: true,
        status: true,
        serviceDate: true,
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
        date: { in: serviceDates },
        employee: { facilityId: input.facilityId },
      },
      select: {
        employeeId: true,
        date: true,
        plannedStart: true,
        plannedEnd: true,
      },
    }),
  ]);

  const candidates: OnDutySupervisorCandidate[] = assignments.flatMap((assignment) => {
    const storedOnPreviousDate = toServiceDateKey(assignment.serviceDate) === previousKey;
    if (storedOnPreviousDate && (!assignment.startsAt || !assignment.endsAt)) return [];
    return [
      {
        assignmentId: assignment.id,
        employeeId: assignment.employeeId,
        roleKey: assignment.roleKey,
        status: assignment.status,
        startsAt: assignment.startsAt,
        endsAt: assignment.endsAt,
        unitId: assignment.unitId,
        spaceIds: assignment.locations.map((location) => location.unitSpaceId),
      },
    ];
  });

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
  const calledOffEmployeeIds = new Set(
    callOffs
      .filter((entry) =>
        calledOffShiftCoversInstant({
          plannedStart: entry.plannedStart,
          plannedEnd: entry.plannedEnd,
          serviceDateKey: toServiceDateKey(entry.date),
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

function previousServiceDateKey(serviceDate: string): string {
  const date = facilityLocalDateToServiceDate(serviceDate);
  date.setUTCDate(date.getUTCDate() - 1);
  return toServiceDateKey(date);
}

