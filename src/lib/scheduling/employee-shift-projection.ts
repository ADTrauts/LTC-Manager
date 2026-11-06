/**
 * EmployeeShiftProjection — reusable RUN read-model.
 *
 * Answers two canonical RUN questions independently:
 *   1. Is this employee working today, and when?  (Shift / presence)
 *   2. What are they responsible for today?       (Daily Assignment / OA)
 *
 * This is a pure data-projection helper. It does NOT automatically create
 * OperationalAssignments from ScheduleEntry rows.
 *
 * See: src/lib/scheduling/SCHEDULING_ARCHITECTURE_CONTRACT.md
 */

export type ShiftPresence = {
  /** Source ScheduleEntry id. */
  scheduleEntryId: string;
  /** Service date (ISO YYYY-MM-DD in facility timezone). */
  serviceDate: string;
  /** plannedStart HH:MM if set. */
  plannedStart: string | null;
  /** plannedEnd HH:MM if set. */
  plannedEnd: string | null;
  /** Legacy meal-slot label. Not primary presence semantics. */
  shiftSlot: string | null;
  /** Department owning this shift (explicit since migration 81; null on legacy rows). */
  departmentId: string | null;
  /** Legacy Unit placement (demoted). */
  legacyUnitId: string | null;
  /** Source WorkShift pattern id if created from a template. */
  workShiftId: string | null;
};

export type DailyAssignmentSummary = {
  assignmentId: string;
  roleLabel: string;
  scopeSummaryLabel: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
};

export type ShiftAssignmentRelationship =
  | "SCHEDULED_AND_ASSIGNED"
  | "SCHEDULED_UNASSIGNED"
  | "ASSIGNED_UNSCHEDULED"
  | "NEITHER";

export type EmployeeShiftProjection = {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  /** Canonical Job Role display name for this service date (from BUILD). */
  jobRoleDisplayName: string | null;
  /** Team display name (from BUILD). */
  teamDisplayName: string | null;
  /** All scheduled shifts for this employee on this service date. */
  shifts: ShiftPresence[];
  /** All Daily Assignments for this employee on this service date. */
  assignments: DailyAssignmentSummary[];
  /** Derived relationship state (see SCHEDULING_ARCHITECTURE_CONTRACT.md). */
  relationship: ShiftAssignmentRelationship;
};

/**
 * Derive the shift/assignment relationship state from presence and assignment data.
 * This is a pure function to keep it hermetically testable.
 */
export function deriveShiftAssignmentRelationship(input: {
  hasActiveShift: boolean;
  hasActiveAssignment: boolean;
}): ShiftAssignmentRelationship {
  if (input.hasActiveShift && input.hasActiveAssignment) return "SCHEDULED_AND_ASSIGNED";
  if (input.hasActiveShift && !input.hasActiveAssignment) return "SCHEDULED_UNASSIGNED";
  if (!input.hasActiveShift && input.hasActiveAssignment) return "ASSIGNED_UNSCHEDULED";
  return "NEITHER";
}

/**
 * Derive a human-readable time window label from shift presence.
 * Returns null if no clock time is available.
 */
export function formatShiftTimeWindow(presence: Pick<ShiftPresence, "plannedStart" | "plannedEnd">): string | null {
  if (!presence.plannedStart || !presence.plannedEnd) return null;
  return `${presence.plannedStart}–${presence.plannedEnd}`;
}

/**
 * True when a ScheduleEntry should be treated as a meaningful active-shift presence.
 * Legacy rows without plannedStart/End are still counted as presence.
 */
export function isActiveShiftPresence(presence: ShiftPresence): boolean {
  // Any ScheduleEntry counts as presence (it represents "working this day").
  // Future: check CANCELLED status if a lifecycle is added.
  return true;
}

/**
 * Build a projection from raw input rows.
 * This is database-agnostic and accepts pre-fetched data to enable hermetic testing.
 */
export function buildEmployeeShiftProjection(input: {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  jobRoleDisplayName: string | null;
  teamDisplayName: string | null;
  serviceDate: string;
  scheduleEntries: Array<{
    id: string;
    plannedStart: string | null;
    plannedEnd: string | null;
    shift: string;
    departmentId: string | null;
    unitId: string | null;
    workShiftId: string | null;
  }>;
  operationalAssignments: Array<{
    id: string;
    roleLabel: string;
    scopeSummaryLabel: string;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
  }>;
}): EmployeeShiftProjection {
  const shifts: ShiftPresence[] = input.scheduleEntries.map((e) => ({
    scheduleEntryId: e.id,
    serviceDate: input.serviceDate,
    plannedStart: e.plannedStart,
    plannedEnd: e.plannedEnd,
    shiftSlot: e.shift,
    departmentId: e.departmentId,
    legacyUnitId: e.unitId,
    workShiftId: e.workShiftId,
  }));

  const activeShiftStatuses = new Set(["PLANNED", "ACTIVE"]);
  const assignments: DailyAssignmentSummary[] = input.operationalAssignments
    .filter((a) => activeShiftStatuses.has(a.status))
    .map((a) => ({
      assignmentId: a.id,
      roleLabel: a.roleLabel,
      scopeSummaryLabel: a.scopeSummaryLabel,
      status: a.status,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
    }));

  const hasActiveShift = shifts.some(isActiveShiftPresence);
  const hasActiveAssignment = assignments.length > 0;

  const relationship = deriveShiftAssignmentRelationship({ hasActiveShift, hasActiveAssignment });

  return {
    employeeId: input.employeeId,
    employeeFirstName: input.employeeFirstName,
    employeeLastName: input.employeeLastName,
    jobRoleDisplayName: input.jobRoleDisplayName,
    teamDisplayName: input.teamDisplayName,
    shifts,
    assignments,
    relationship,
  };
}
