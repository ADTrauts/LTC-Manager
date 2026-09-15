/**
 * Department-day schedule query.
 *
 * Answers: Who is working in this Department on this service date?
 * Also surfaces ASSIGNED_UNSCHEDULED employees (OA without Shift).
 */

import { employeeBelongsToDepartmentWhere } from "@/lib/employee-membership";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import {
  buildEmployeeShiftProjection,
  type EmployeeShiftProjection,
} from "./employee-shift-projection";
import { summarizeAssignmentScopeHierarchy } from "./assignment-scope-summary";
import {
  formatAssignmentCoverageContext,
  shiftAssignmentRelationshipLabel,
} from "./relationship-labels";
import { formatShiftWindow12h } from "./shift-clock-time";

export type WorkShiftOption = {
  id: string;
  name: string;
  startLocal: string;
  endLocal: string;
};

export type DepartmentDayScheduleEmployee = {
  projection: EmployeeShiftProjection;
  jobTitleDisplayName: string | null;
  relationshipLabel: string;
  coverageContext: string | null;
  shiftWindowLabels: string[];
  isLegacyOnly: boolean;
};

export type DepartmentDaySchedule = {
  facilityId: string;
  departmentId: string;
  departmentName: string;
  serviceDate: string;
  employees: DepartmentDayScheduleEmployee[];
  unscheduledPool: Array<{
    id: string;
    firstName: string;
    lastName: string;
    jobRoleDisplayName: string | null;
    teamDisplayName: string | null;
    jobTitleDisplayName: string | null;
  }>;
  workShifts: WorkShiftOption[];
};

function dayWindow(serviceDate: string): { start: Date; end: Date } {
  const start = facilityLocalDateToServiceDate(serviceDate);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function loadDepartmentDaySchedule(input: {
  facilityId: string;
  departmentId: string;
  serviceDate: string;
}): Promise<DepartmentDaySchedule> {
  const { facilityId, departmentId, serviceDate } = input;
  const { start, end } = dayWindow(serviceDate);
  const oaServiceDate = facilityLocalDateToServiceDate(serviceDate);

  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true, name: true },
  });
  if (!department) {
    throw new Error("Department not found.");
  }

  const [employees, scheduleEntries, assignments, workShifts] = await Promise.all([
    prisma.employee.findMany({
      where: {
        facilityId,
        status: "ACTIVE",
        AND: [employeeBelongsToDepartmentWhere(departmentId)],
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        jobTitle: { select: { name: true } },
        departmentJobRoles: {
          where: { departmentId, jobRole: { status: "ACTIVE" } },
          select: { jobRole: { select: { displayName: true } } },
          take: 1,
        },
        teamMemberships: {
          where: { team: { departmentId, status: "ACTIVE" } },
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
          { departmentId },
          // Legacy rows without departmentId: include if employee is in this Department.
          {
            departmentId: null,
            employee: { AND: [employeeBelongsToDepartmentWhere(departmentId)] },
          },
        ],
        employee: { facilityId },
      },
      select: {
        id: true,
        employeeId: true,
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
        facilityId,
        departmentId,
        serviceDate: oaServiceDate,
        status: { in: ["PLANNED", "ACTIVE"] },
      },
      select: {
        id: true,
        employeeId: true,
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
        facilityId,
        isActive: true,
        OR: [{ departmentId }, { departmentId: null }],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, startLocal: true, endLocal: true },
    }),
  ]);

  const shiftsByEmployee = new Map<string, typeof scheduleEntries>();
  for (const entry of scheduleEntries) {
    const list = shiftsByEmployee.get(entry.employeeId) ?? [];
    list.push(entry);
    shiftsByEmployee.set(entry.employeeId, list);
  }

  const assignmentsByEmployee = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = assignmentsByEmployee.get(a.employeeId) ?? [];
    list.push(a);
    assignmentsByEmployee.set(a.employeeId, list);
  }

  const employeeIdsOnBoard = new Set<string>([
    ...scheduleEntries.map((s) => s.employeeId),
    ...assignments.map((a) => a.employeeId),
  ]);

  // Include assigned-unscheduled employees who may not be in active membership query
  // (e.g. membership changed after OA). Load any missing OA employees.
  const missingAssignedIds = [...employeeIdsOnBoard].filter(
    (id) => !employees.some((e) => e.id === id),
  );
  const extraEmployees =
    missingAssignedIds.length > 0
      ? await prisma.employee.findMany({
          where: { id: { in: missingAssignedIds }, facilityId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: { select: { name: true } },
            departmentJobRoles: {
              where: { departmentId, jobRole: { status: "ACTIVE" } },
              select: { jobRole: { select: { displayName: true } } },
              take: 1,
            },
            teamMemberships: {
              where: { team: { departmentId } },
              select: { isPrimary: true, team: { select: { displayName: true } } },
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              take: 1,
            },
          },
        })
      : [];

  const allEmployees = [...employees, ...extraEmployees];
  const byId = new Map(allEmployees.map((e) => [e.id, e]));

  const rows: DepartmentDayScheduleEmployee[] = [];
  for (const empId of employeeIdsOnBoard) {
    const emp = byId.get(empId);
    if (!emp) continue;
    const empShifts = shiftsByEmployee.get(empId) ?? [];
    const empAssignments = assignmentsByEmployee.get(empId) ?? [];

    // Skip employees with neither shift nor assignment (shouldn't happen from set above).
    if (empShifts.length === 0 && empAssignments.length === 0) continue;

    const projection = buildEmployeeShiftProjection({
      employeeId: emp.id,
      employeeFirstName: emp.firstName,
      employeeLastName: emp.lastName,
      jobRoleDisplayName: emp.departmentJobRoles[0]?.jobRole.displayName ?? null,
      teamDisplayName: emp.teamMemberships[0]?.team.displayName ?? null,
      serviceDate,
      scheduleEntries: empShifts.map((s) => ({
        id: s.id,
        plannedStart: s.plannedStart,
        plannedEnd: s.plannedEnd,
        shift: s.shift,
        departmentId: s.departmentId,
        unitId: s.unitId,
        workShiftId: s.workShiftId,
      })),
      operationalAssignments: empAssignments.map((a) => ({
        id: a.id,
        roleLabel: a.roleLabel,
        scopeSummaryLabel: summarizeAssignmentScopeHierarchy({
          locations: a.locations,
          unitName: a.unit?.name ?? null,
        }),
        status: a.status,
        startsAt: a.startsAt?.toISOString() ?? null,
        endsAt: a.endsAt?.toISOString() ?? null,
      })),
    });

    const isLegacyOnly =
      empShifts.length > 0 &&
      empShifts.every((s) => !s.plannedStart || !s.plannedEnd || s.departmentId == null);

    rows.push({
      projection,
      jobTitleDisplayName: emp.jobTitle?.name ?? null,
      relationshipLabel: shiftAssignmentRelationshipLabel(projection.relationship),
      coverageContext: formatAssignmentCoverageContext({
        relationship: projection.relationship,
        scopeSummaryLabels: projection.assignments.map((a) => a.scopeSummaryLabel),
      }),
      shiftWindowLabels: projection.shifts
        .map((s) => formatShiftWindow12h(s) ?? (s.shiftSlot ? `Legacy: ${s.shiftSlot}` : null))
        .filter((v): v is string => Boolean(v)),
      isLegacyOnly,
    });
  }

  // Sort: assigned-unscheduled first (attention), then scheduled rows by last name.
  rows.sort((a, b) => {
    const rank = (r: typeof a) =>
      r.projection.relationship === "ASSIGNED_UNSCHEDULED"
        ? 0
        : r.projection.relationship === "SCHEDULED_UNASSIGNED"
          ? 1
          : r.projection.relationship === "SCHEDULED_AND_ASSIGNED"
            ? 2
            : 3;
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return a.projection.employeeLastName.localeCompare(b.projection.employeeLastName);
  });

  const scheduledIds = new Set(rows.map((r) => r.projection.employeeId));
  const unscheduledPool = employees
    .filter((e) => !scheduledIds.has(e.id) && !(shiftsByEmployee.get(e.id)?.length))
    .filter((e) => !(assignmentsByEmployee.get(e.id)?.length))
    .map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      jobRoleDisplayName: e.departmentJobRoles[0]?.jobRole.displayName ?? null,
      teamDisplayName: e.teamMemberships[0]?.team.displayName ?? null,
      jobTitleDisplayName: e.jobTitle?.name ?? null,
    }));

  return {
    facilityId,
    departmentId: department.id,
    departmentName: department.name,
    serviceDate,
    employees: rows,
    unscheduledPool,
    workShifts,
  };
}

/** Facility-wide read view grouped by Department (All departments). */
export async function loadFacilityDaySchedule(input: {
  facilityId: string;
  serviceDate: string;
}): Promise<Array<{ departmentId: string; departmentName: string; schedule: DepartmentDaySchedule }>> {
  const departments = await prisma.department.findMany({
    where: { facilityId: input.facilityId, isActive: true, showInEmployeeApp: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const schedules = await Promise.all(
    departments.map(async (d) => ({
      departmentId: d.id,
      departmentName: d.name,
      schedule: await loadDepartmentDaySchedule({
        facilityId: input.facilityId,
        departmentId: d.id,
        serviceDate: input.serviceDate,
      }),
    })),
  );
  return schedules.filter((s) => s.schedule.employees.length > 0);
}
