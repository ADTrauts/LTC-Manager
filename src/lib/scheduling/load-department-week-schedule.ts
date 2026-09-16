/**
 * Bounded Department-week schedule loader (Employee View read model).
 * One query set for the whole week — avoids 7× day loaders.
 */

import { employeeBelongsToDepartmentWhere } from "@/lib/employee-membership";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { summarizeAssignmentScopeHierarchy } from "./assignment-scope-summary";
import {
  buildDepartmentWeekScheduleProjection,
  type DepartmentWeekScheduleProjection,
} from "./department-week-schedule-projection";
import {
  buildScheduleWeekRange,
  scheduleWeekdayLongLabel,
  type ScheduleWeekRange,
} from "./schedule-week-range";

export type WorkShiftOption = {
  id: string;
  name: string;
  startLocal: string;
  endLocal: string;
};

export type DepartmentWeekScheduleBundle = {
  projection: DepartmentWeekScheduleProjection;
  workShifts: WorkShiftOption[];
  /** Active Department employees available for add-shift (membership pool). */
  employeePool: Array<{
    id: string;
    firstName: string;
    lastName: string;
    jobRoleDisplayName: string | null;
    teamDisplayName: string | null;
  }>;
};

function serviceDateKeyFromUtcMidnight(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekWindow(week: ScheduleWeekRange): { start: Date; end: Date } {
  const start = facilityLocalDateToServiceDate(week.weekStart);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

export async function loadDepartmentWeekSchedule(input: {
  facilityId: string;
  departmentId: string;
  /** Any date in the target week. */
  anchorDate: string;
}): Promise<DepartmentWeekScheduleBundle> {
  const week = buildScheduleWeekRange({ anchorDate: input.anchorDate });
  const { start, end } = weekWindow(week);
  const oaStart = facilityLocalDateToServiceDate(week.weekStart);
  const oaEnd = new Date(oaStart);
  oaEnd.setUTCDate(oaEnd.getUTCDate() + 7);

  const department = await prisma.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
    select: { id: true, name: true },
  });
  if (!department) {
    throw new Error("Department not found.");
  }

  const [employees, scheduleEntries, assignments, workShifts] = await Promise.all([
    prisma.employee.findMany({
      where: {
        facilityId: input.facilityId,
        status: "ACTIVE",
        AND: [employeeBelongsToDepartmentWhere(input.departmentId)],
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        jobTitle: { select: { name: true } },
        departmentJobRoles: {
          where: { departmentId: input.departmentId, jobRole: { status: "ACTIVE" } },
          select: { jobRole: { select: { displayName: true } } },
          take: 1,
        },
        teamMemberships: {
          where: { team: { departmentId: input.departmentId, status: "ACTIVE" } },
          select: { isPrimary: true, team: { select: { displayName: true } } },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
        },
      },
    }),
    prisma.scheduleEntry.findMany({
      where: {
        date: { gte: start, lt: end },
        OR: [
          { departmentId: input.departmentId },
          {
            departmentId: null,
            employee: { AND: [employeeBelongsToDepartmentWhere(input.departmentId)] },
          },
        ],
        employee: { facilityId: input.facilityId },
      },
      select: {
        id: true,
        employeeId: true,
        date: true,
        plannedStart: true,
        plannedEnd: true,
        shift: true,
        departmentId: true,
        unitId: true,
        workShiftId: true,
      },
      orderBy: [{ plannedStart: "asc" }, { createdAt: "asc" }],
    }),
    prisma.operationalAssignment.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate: { gte: oaStart, lt: oaEnd },
        status: { in: ["PLANNED", "ACTIVE"] },
      },
      select: {
        id: true,
        employeeId: true,
        serviceDate: true,
        roleLabel: true,
        status: true,
        startsAt: true,
        endsAt: true,
        unit: { select: { name: true } },
        locations: {
          select: {
            labelSnapshot: true,
            unitSpace: {
              select: {
                name: true,
                roomNumber: true,
                unit: {
                  select: {
                    name: true,
                    hierarchyRole: true,
                    parentUnit: { select: { name: true, hierarchyRole: true } },
                  },
                },
              },
            },
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    prisma.workShift.findMany({
      where: {
        facilityId: input.facilityId,
        isActive: true,
        OR: [{ departmentId: input.departmentId }, { departmentId: null }],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, startLocal: true, endLocal: true },
    }),
  ]);

  // Pull any assigned/scheduled employees missing from active membership pool.
  const boardIds = new Set<string>([
    ...scheduleEntries.map((s) => s.employeeId),
    ...assignments.map((a) => a.employeeId),
  ]);
  const missingIds = [...boardIds].filter((id) => !employees.some((e) => e.id === id));
  const extraEmployees =
    missingIds.length > 0
      ? await prisma.employee.findMany({
          where: { id: { in: missingIds }, facilityId: input.facilityId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: { select: { name: true } },
            departmentJobRoles: {
              where: { departmentId: input.departmentId, jobRole: { status: "ACTIVE" } },
              select: { jobRole: { select: { displayName: true } } },
              take: 1,
            },
            teamMemberships: {
              where: { team: { departmentId: input.departmentId } },
              select: { isPrimary: true, team: { select: { displayName: true } } },
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              take: 1,
            },
          },
        })
      : [];

  const allEmployees = [...employees, ...extraEmployees];
  const dayLongLabels = Object.fromEntries(
    week.days.map((d) => [d, scheduleWeekdayLongLabel(d)]),
  );

  const projection = buildDepartmentWeekScheduleProjection({
    facilityId: input.facilityId,
    departmentId: department.id,
    departmentName: department.name,
    week,
    employees: allEmployees.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      teamDisplayName: e.teamMemberships[0]?.team.displayName ?? null,
      jobRoleDisplayName: e.departmentJobRoles[0]?.jobRole.displayName ?? null,
      jobTitleDisplayName: e.jobTitle?.name ?? null,
    })),
    scheduleEntries: scheduleEntries.map((s) => ({
      id: s.id,
      employeeId: s.employeeId,
      serviceDate: serviceDateKeyFromUtcMidnight(s.date),
      plannedStart: s.plannedStart,
      plannedEnd: s.plannedEnd,
      shift: s.shift,
      departmentId: s.departmentId,
      unitId: s.unitId,
      workShiftId: s.workShiftId,
    })),
    assignments: assignments.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      serviceDate: serviceDateKeyFromUtcMidnight(a.serviceDate),
      roleLabel: a.roleLabel,
      scopeSummaryLabel: summarizeAssignmentScopeHierarchy({
        locations: a.locations,
        unitName: a.unit?.name ?? null,
      }),
      status: a.status,
      startsAt: a.startsAt?.toISOString() ?? null,
      endsAt: a.endsAt?.toISOString() ?? null,
    })),
    dayLongLabels,
  });

  return {
    projection,
    workShifts,
    employeePool: employees.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      jobRoleDisplayName: e.departmentJobRoles[0]?.jobRole.displayName ?? null,
      teamDisplayName: e.teamMemberships[0]?.team.displayName ?? null,
    })),
  };
}

/** Facility-wide weekly read (All Departments) — parallel per-department loads. */
export async function loadFacilityWeekSchedule(input: {
  facilityId: string;
  anchorDate: string;
}): Promise<
  Array<{
    departmentId: string;
    departmentName: string;
    bundle: DepartmentWeekScheduleBundle;
  }>
> {
  const departments = await prisma.department.findMany({
    where: { facilityId: input.facilityId, isActive: true, showInEmployeeApp: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const bundles = await Promise.all(
    departments.map(async (d) => ({
      departmentId: d.id,
      departmentName: d.name,
      bundle: await loadDepartmentWeekSchedule({
        facilityId: input.facilityId,
        departmentId: d.id,
        anchorDate: input.anchorDate,
      }),
    })),
  );
  return bundles.filter(
    (b) =>
      b.bundle.projection.summary.scheduledEmployeeCount > 0 ||
      b.bundle.projection.summary.assignedUnscheduledDayCount > 0,
  );
}
