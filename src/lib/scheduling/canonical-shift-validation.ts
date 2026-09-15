/**
 * Canonical Shift create/edit validation (pure).
 * Server actions call these before persistence.
 *
 * Future capability hooks: VIEW_STAFFING / MANAGE_SCHEDULE — not enforced yet.
 */

import { isValidClockTimeHhMm, shiftIntervalsOverlap } from "./shift-clock-time";

export type CanonicalShiftCreateInput = {
  facilityId: string;
  employeeId: string;
  departmentId: string;
  serviceDate: string;
  plannedStart: string;
  plannedEnd: string;
  workShiftId?: string | null;
};

export type ExistingShiftInterval = {
  id: string;
  plannedStart: string | null;
  plannedEnd: string | null;
};

export type CanonicalShiftValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateCanonicalShiftTimes(input: {
  plannedStart: string;
  plannedEnd: string;
}): CanonicalShiftValidationResult {
  if (!isValidClockTimeHhMm(input.plannedStart)) {
    return { ok: false, error: "Start time is required (HH:MM)." };
  }
  if (!isValidClockTimeHhMm(input.plannedEnd)) {
    return { ok: false, error: "End time is required (HH:MM)." };
  }
  // Equal start/end is treated as overnight 24h by normalizeShiftInterval; reject zero-length intent.
  if (input.plannedStart.trim() === input.plannedEnd.trim()) {
    return { ok: false, error: "Start and end times must differ." };
  }
  return { ok: true };
}

export function validateServiceDateKey(serviceDate: string): CanonicalShiftValidationResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate.trim())) {
    return { ok: false, error: "Service date must be YYYY-MM-DD." };
  }
  return { ok: true };
}

/**
 * Reject overlapping Shifts for the same employee on the same service date.
 * Cross-Department overlaps are also rejected (employee cannot work two places at once).
 */
export function validateNoShiftOverlap(input: {
  plannedStart: string;
  plannedEnd: string;
  existing: ExistingShiftInterval[];
  excludeShiftId?: string | null;
}): CanonicalShiftValidationResult {
  const candidate = {
    plannedStart: input.plannedStart,
    plannedEnd: input.plannedEnd,
  };
  for (const row of input.existing) {
    if (input.excludeShiftId && row.id === input.excludeShiftId) continue;
    if (!row.plannedStart || !row.plannedEnd) continue;
    if (!isValidClockTimeHhMm(row.plannedStart) || !isValidClockTimeHhMm(row.plannedEnd)) continue;
    if (
      shiftIntervalsOverlap(candidate, {
        plannedStart: row.plannedStart,
        plannedEnd: row.plannedEnd,
      })
    ) {
      return {
        ok: false,
        error: `Shift overlaps an existing shift (${row.plannedStart}–${row.plannedEnd}).`,
      };
    }
  }
  return { ok: true };
}

export type EmployeeEligibilitySnapshot = {
  id: string;
  facilityId: string;
  status: string;
  belongsToDepartment: boolean;
};

export function validateEmployeeEligibleForDepartmentShift(
  employee: EmployeeEligibilitySnapshot | null,
  input: { facilityId: string; departmentId: string },
): CanonicalShiftValidationResult {
  if (!employee) return { ok: false, error: "Employee not found." };
  if (employee.facilityId !== input.facilityId) {
    return { ok: false, error: "Cross-facility employee rejected." };
  }
  if (employee.status !== "ACTIVE") {
    return { ok: false, error: "Inactive employees cannot be scheduled." };
  }
  if (!employee.belongsToDepartment) {
    return { ok: false, error: "Employee does not belong to this Department." };
  }
  return { ok: true };
}
