/**
 * DepartmentWeekScheduleProjection — pure weekly employee schedule read-model.
 *
 * Answers: Who is working each day this week, and how does Shift relate to Daily Assignment?
 * Not coupled to React. Built from prefetched employee/shift/assignment rows.
 */

import {
  buildEmployeeShiftProjection,
  type EmployeeShiftProjection,
  type ShiftAssignmentRelationship,
} from "./employee-shift-projection";
import { formatShiftWindowCompact } from "./shift-clock-time";
import type { ScheduleWeekRange } from "./schedule-week-range";

export type WeekDayCellShift = {
  scheduleEntryId: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  compactLabel: string | null;
  accessibleLabel: string;
  workShiftId: string | null;
  isLegacyOnly: boolean;
};

export type WeekDayCell = {
  serviceDate: string;
  shifts: WeekDayCellShift[];
  relationship: ShiftAssignmentRelationship;
  /** True when scheduled but missing Daily Assignment. */
  needsAssignment: boolean;
  /** True when OA exists without Shift. */
  assignedUnscheduled: boolean;
  assignmentScopeLabels: string[];
};

export type DepartmentWeekEmployeeRow = {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  teamDisplayName: string | null;
  jobRoleDisplayName: string | null;
  jobTitleDisplayName: string | null;
  /** Per-day projections for the week (aligned with week.days). */
  days: WeekDayCell[];
  /** True if employee has at least one Shift in the week. */
  hasAnyShift: boolean;
  /** True if employee has at least one Daily Assignment in the week. */
  hasAnyAssignment: boolean;
};

export type DepartmentWeekScheduleSummary = {
  employeeCount: number;
  scheduledEmployeeCount: number;
  needAssignmentDayCount: number;
  assignedUnscheduledDayCount: number;
};

export type DepartmentWeekScheduleProjection = {
  facilityId: string;
  departmentId: string;
  departmentName: string;
  week: ScheduleWeekRange;
  employees: DepartmentWeekEmployeeRow[];
  summary: DepartmentWeekScheduleSummary;
  filterOptions: {
    teams: string[];
    jobRoles: string[];
  };
};

export type WeekScheduleEntryInput = {
  id: string;
  employeeId: string;
  serviceDate: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  shift: string;
  departmentId: string | null;
  unitId: string | null;
  workShiftId: string | null;
};

export type WeekAssignmentInput = {
  id: string;
  employeeId: string;
  serviceDate: string;
  roleLabel: string;
  scopeSummaryLabel: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
};

export type WeekEmployeeInput = {
  id: string;
  firstName: string;
  lastName: string;
  teamDisplayName: string | null;
  jobRoleDisplayName: string | null;
  jobTitleDisplayName: string | null;
};

function accessibleShiftLabel(input: {
  employeeName: string;
  dayLabel: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  compactLabel: string | null;
}): string {
  if (input.plannedStart && input.plannedEnd) {
    return `${input.employeeName}, ${input.dayLabel}, ${input.plannedStart} to ${input.plannedEnd}`;
  }
  if (input.compactLabel) {
    return `${input.employeeName}, ${input.dayLabel}, ${input.compactLabel}`;
  }
  return `${input.employeeName}, ${input.dayLabel}, scheduled`;
}

export function buildDepartmentWeekScheduleProjection(input: {
  facilityId: string;
  departmentId: string;
  departmentName: string;
  week: ScheduleWeekRange;
  employees: WeekEmployeeInput[];
  scheduleEntries: WeekScheduleEntryInput[];
  assignments: WeekAssignmentInput[];
  /** Optional long day labels for a11y (keyed by ISO date). */
  dayLongLabels?: Record<string, string>;
}): DepartmentWeekScheduleProjection {
  const shiftsByEmployeeDay = new Map<string, WeekScheduleEntryInput[]>();
  for (const entry of input.scheduleEntries) {
    const key = `${entry.employeeId}|${entry.serviceDate}`;
    const list = shiftsByEmployeeDay.get(key) ?? [];
    list.push(entry);
    shiftsByEmployeeDay.set(key, list);
  }

  const assignmentsByEmployeeDay = new Map<string, WeekAssignmentInput[]>();
  for (const a of input.assignments) {
    const key = `${a.employeeId}|${a.serviceDate}`;
    const list = assignmentsByEmployeeDay.get(key) ?? [];
    list.push(a);
    assignmentsByEmployeeDay.set(key, list);
  }

  const employees: DepartmentWeekEmployeeRow[] = input.employees.map((emp) => {
    const employeeName = `${emp.firstName} ${emp.lastName}`.trim();
    const days: WeekDayCell[] = input.week.days.map((serviceDate) => {
      const key = `${emp.id}|${serviceDate}`;
      const dayShifts = shiftsByEmployeeDay.get(key) ?? [];
      const dayAssignments = assignmentsByEmployeeDay.get(key) ?? [];
      const dayLabel = input.dayLongLabels?.[serviceDate] ?? serviceDate;

      const projection: EmployeeShiftProjection = buildEmployeeShiftProjection({
        employeeId: emp.id,
        employeeFirstName: emp.firstName,
        employeeLastName: emp.lastName,
        jobRoleDisplayName: emp.jobRoleDisplayName,
        teamDisplayName: emp.teamDisplayName,
        serviceDate,
        scheduleEntries: dayShifts.map((s) => ({
          id: s.id,
          plannedStart: s.plannedStart,
          plannedEnd: s.plannedEnd,
          shift: s.shift,
          departmentId: s.departmentId,
          unitId: s.unitId,
          workShiftId: s.workShiftId,
        })),
        operationalAssignments: dayAssignments.map((a) => ({
          id: a.id,
          roleLabel: a.roleLabel,
          scopeSummaryLabel: a.scopeSummaryLabel,
          status: a.status,
          startsAt: a.startsAt,
          endsAt: a.endsAt,
        })),
      });

      const shifts: WeekDayCellShift[] = projection.shifts.map((s) => {
        const compactLabel = formatShiftWindowCompact(s);
        const isLegacyOnly = !s.plannedStart || !s.plannedEnd || s.departmentId == null;
        return {
          scheduleEntryId: s.scheduleEntryId,
          plannedStart: s.plannedStart,
          plannedEnd: s.plannedEnd,
          compactLabel,
          accessibleLabel: accessibleShiftLabel({
            employeeName,
            dayLabel,
            plannedStart: s.plannedStart,
            plannedEnd: s.plannedEnd,
            compactLabel,
          }),
          workShiftId: s.workShiftId,
          isLegacyOnly,
        };
      });

      return {
        serviceDate,
        shifts,
        relationship: projection.relationship,
        needsAssignment: projection.relationship === "SCHEDULED_UNASSIGNED",
        assignedUnscheduled: projection.relationship === "ASSIGNED_UNSCHEDULED",
        assignmentScopeLabels: projection.assignments.map((a) => a.scopeSummaryLabel),
      };
    });

    return {
      employeeId: emp.id,
      employeeFirstName: emp.firstName,
      employeeLastName: emp.lastName,
      teamDisplayName: emp.teamDisplayName,
      jobRoleDisplayName: emp.jobRoleDisplayName,
      jobTitleDisplayName: emp.jobTitleDisplayName,
      days,
      hasAnyShift: days.some((d) => d.shifts.length > 0),
      hasAnyAssignment: days.some((d) => d.assignmentScopeLabels.length > 0 || d.assignedUnscheduled),
    };
  });

  // Prefer Team then name for manager scanability.
  employees.sort((a, b) => {
    const teamA = a.teamDisplayName ?? "\uffff";
    const teamB = b.teamDisplayName ?? "\uffff";
    const teamCmp = teamA.localeCompare(teamB);
    if (teamCmp !== 0) return teamCmp;
    const last = a.employeeLastName.localeCompare(b.employeeLastName);
    if (last !== 0) return last;
    return a.employeeFirstName.localeCompare(b.employeeFirstName);
  });

  let needAssignmentDayCount = 0;
  let assignedUnscheduledDayCount = 0;
  for (const row of employees) {
    for (const day of row.days) {
      if (day.needsAssignment) needAssignmentDayCount += 1;
      if (day.assignedUnscheduled) assignedUnscheduledDayCount += 1;
    }
  }

  const teams = [
    ...new Set(employees.map((e) => e.teamDisplayName).filter((v): v is string => Boolean(v))),
  ].sort();
  const jobRoles = [
    ...new Set(employees.map((e) => e.jobRoleDisplayName).filter((v): v is string => Boolean(v))),
  ].sort();

  return {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    departmentName: input.departmentName,
    week: input.week,
    employees,
    summary: {
      employeeCount: employees.length,
      scheduledEmployeeCount: employees.filter((e) => e.hasAnyShift).length,
      needAssignmentDayCount,
      assignedUnscheduledDayCount,
    },
    filterOptions: { teams, jobRoles },
  };
}

/** Filter helpers for Employee View (pure). */
export function filterDepartmentWeekEmployees(
  projection: DepartmentWeekScheduleProjection,
  filters: {
    team?: string | null;
    jobRole?: string | null;
    search?: string | null;
    scheduledOnly?: boolean;
    unscheduledOnly?: boolean;
  },
): DepartmentWeekEmployeeRow[] {
  const search = filters.search?.trim().toLowerCase() ?? "";
  return projection.employees.filter((row) => {
    if (filters.team && row.teamDisplayName !== filters.team) return false;
    if (filters.jobRole && row.jobRoleDisplayName !== filters.jobRole) return false;
    if (filters.scheduledOnly && !row.hasAnyShift) return false;
    if (filters.unscheduledOnly && row.hasAnyShift) return false;
    if (search) {
      const hay = `${row.employeeFirstName} ${row.employeeLastName} ${row.teamDisplayName ?? ""} ${row.jobRoleDisplayName ?? ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}
