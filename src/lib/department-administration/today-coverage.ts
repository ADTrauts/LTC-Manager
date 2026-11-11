import type { Prisma, PrismaClient } from "@prisma/client";

import { employeeBelongsToDepartmentWhere } from "@/lib/employee-membership";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  toServiceDateKey,
} from "@/lib/operational-time";
import { buildDietaryCoverageSummary } from "@/lib/scheduling/operational-assignments/build-coverage-summary";

import { presentTodayCoverage, type TodayCoverageView } from "./people-coverage-presentation";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type DepartmentTodayCoverage = {
  serviceDateKey: string;
  view: TodayCoverageView;
  runHref: string;
};

/**
 * Today's Coverage for one Department. Fill comes from
 * `buildDietaryCoverageSummary`, which evaluates published requirements
 * against OperationalAssignment rows for every Department. The function
 * name is historical; it is not a second algorithm.
 */
export async function loadDepartmentTodayCoverage(
  client: DbClient,
  input: { facilityId: string; departmentId: string; now?: Date },
): Promise<DepartmentTodayCoverage> {
  const facility = await client.facility.findUnique({
    where: { id: input.facilityId },
    select: { timezone: true },
  });
  const serviceDate = getFacilityServiceDate(facility?.timezone, input.now);
  const serviceDateKey = toServiceDateKey(serviceDate);
  const serviceDateValue = facilityLocalDateToServiceDate(serviceDateKey);
  const shiftDayStart = new Date(`${serviceDateKey}T00:00:00`);
  const shiftDayEnd = new Date(`${serviceDateKey}T23:59:59.999`);

  const [assignments, callOffs, plan] = await Promise.all([
    client.operationalAssignment.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate: serviceDateValue,
        status: { in: ["PLANNED", "ACTIVE"] },
      },
      select: {
        id: true,
        roleKey: true,
        status: true,
        unitId: true,
        startsAt: true,
        endsAt: true,
        employeeId: true,
        unit: { select: { name: true } },
        locations: { select: { unitSpaceId: true } },
      },
    }),
    client.scheduleEntry.findMany({
      where: {
        date: { gte: shiftDayStart, lte: shiftDayEnd },
        calledOffAt: { not: null },
        OR: [
          { departmentId: input.departmentId },
          { employee: employeeBelongsToDepartmentWhere(input.departmentId) },
        ],
      },
      select: { employeeId: true },
    }),
    client.operationalAssignmentPlan.findFirst({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate: serviceDateValue,
      },
      select: { status: true },
    }),
  ]);

  const calledOff = new Set(callOffs.map((row) => row.employeeId));
  const summary = await buildDietaryCoverageSummary(client, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    serviceDateKey,
    planStatus: plan?.status ?? null,
    facilityTimezone: facility?.timezone,
    assignments: assignments.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      unitId: row.unitId,
      unitName: row.unit?.name ?? null,
      roleKey: row.roleKey,
      status: row.status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      coveredSpaceIds: row.locations.map((location) => location.unitSpaceId),
      hasCallDown: calledOff.has(row.employeeId),
    })),
    scheduledEmployeeIds: [],
    assignedEmployeeIds: assignments.map((row) => row.employeeId),
    callOffEmployeeIds: [...calledOff],
  });

  const params = new URLSearchParams({
    date: serviceDateKey,
    department: input.departmentId,
  });
  return {
    serviceDateKey,
    view: presentTodayCoverage({ serviceDateKey, rows: summary.rows }),
    runHref: `/staffing/assignments?${params.toString()}`,
  };
}
