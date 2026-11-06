/**
 * A call-off marks a Shift absent for its whole planned window.
 * calledOffAt is when the absence was recorded. It does not start a partial shift.
 * Coverage, On-Duty Supervisor, and On-Call Coverage use this window.
 * The Assignment row stays. It stops counting while the window covers it.
 */

import {
  parseFacilityLocalScheduledStartOnDate,
  toServiceDateKey,
  facilityLocalDateToServiceDate,
} from "@/lib/operational-time";
import { serviceDateWindow } from "@/lib/scheduling/operational-assignments/on-duty-supervisor";

export type CalledOffShift = {
  employeeId: string;
  departmentId: string | null;
  serviceDateKey: string;
  plannedStart: string | null;
  plannedEnd: string | null;
};

export function previousServiceDateKey(serviceDateKey: string): string {
  const date = facilityLocalDateToServiceDate(serviceDateKey);
  date.setUTCDate(date.getUTCDate() - 1);
  return toServiceDateKey(date);
}

export function calledOffShiftInterval(
  shift: Pick<CalledOffShift, "plannedStart" | "plannedEnd" | "serviceDateKey">,
  timeZone: string,
): { start: Date; end: Date } | null {
  const day = serviceDateWindow(shift.serviceDateKey, timeZone);
  if (!day) return null;
  const start = shift.plannedStart
    ? parseFacilityLocalScheduledStartOnDate(shift.plannedStart, shift.serviceDateKey, timeZone)
    : null;
  const end = shift.plannedEnd
    ? parseFacilityLocalScheduledStartOnDate(shift.plannedEnd, shift.serviceDateKey, timeZone)
    : null;
  if (start && end && end.getTime() <= start.getTime()) {
    return { start, end: new Date(end.getTime() + 24 * 60 * 60 * 1000) };
  }
  return { start: start ?? day.start, end: end ?? day.end };
}

export function calledOffShiftCoversInstant(input: {
  plannedStart: string | null;
  plannedEnd: string | null;
  serviceDateKey: string;
  at: Date;
  timeZone: string;
}): boolean {
  const interval = calledOffShiftInterval(input, input.timeZone);
  if (!interval) return false;
  return input.at.getTime() >= interval.start.getTime() && input.at.getTime() < interval.end.getTime();
}

/**
 * The Assignment stops counting when this called-off Shift is the same Employee
 * and Department and the windows overlap. A Shift with no Department does not
 * change another Department's Coverage.
 */
export function calledOffShiftExcludesAssignment(input: {
  shift: CalledOffShift;
  assignment: {
    employeeId: string;
    departmentId: string;
    startsAt: Date | null;
    endsAt: Date | null;
    serviceDateKey: string;
  };
  timeZone: string;
}): boolean {
  if (input.shift.employeeId !== input.assignment.employeeId) return false;
  if (!input.shift.departmentId || input.shift.departmentId !== input.assignment.departmentId) {
    return false;
  }
  const shiftWindow = calledOffShiftInterval(input.shift, input.timeZone);
  const day = serviceDateWindow(input.assignment.serviceDateKey, input.timeZone);
  if (!shiftWindow || !day) return false;
  const assignmentStart = input.assignment.startsAt ?? day.start;
  const assignmentEnd = input.assignment.endsAt ?? day.end;
  return (
    shiftWindow.start.getTime() < assignmentEnd.getTime() &&
    assignmentStart.getTime() < shiftWindow.end.getTime()
  );
}
