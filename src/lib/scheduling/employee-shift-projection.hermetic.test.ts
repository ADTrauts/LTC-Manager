/**
 * Hermetic tests for EmployeeShiftProjection read-model.
 *
 * Tests validate:
 *   - Shift presence independent from Daily Assignment
 *   - ShiftAssignmentRelationship all four states (A/B/C/D)
 *   - Department ownership in projection
 *   - Clock-time window formatting
 *   - Legacy rows (no departmentId, no plannedStart) remain readable
 *   - Overnight interval is structurally supported (no hard block)
 *   - Cancelled/completed OA excluded from "active" assignments
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEmployeeShiftProjection,
  deriveShiftAssignmentRelationship,
  formatShiftTimeWindow,
} from "./employee-shift-projection";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const BASE_EMPLOYEE = {
  employeeId: "emp-sharon",
  employeeFirstName: "Sharon",
  employeeLastName: "Doe",
  jobRoleDisplayName: "Resident Services Supervisor",
  teamDisplayName: "Resident Services",
  serviceDate: "2026-09-03",
};

function makeShiftEntry(overrides: Partial<{
  id: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  shift: string;
  departmentId: string | null;
  unitId: string | null;
  workShiftId: string | null;
}> = {}) {
  return {
    id: "se-1",
    plannedStart: "06:30",
    plannedEnd: "15:00",
    shift: "FULL_DAY",
    departmentId: "dept-dietary",
    unitId: null,
    workShiftId: null,
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<{
  id: string;
  roleLabel: string;
  scopeSummaryLabel: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
}> = {}) {
  return {
    id: "oa-1",
    roleLabel: "Resident Services Supervisor",
    scopeSummaryLabel: "Floors 1 & 2",
    status: "PLANNED",
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

// ─── deriveShiftAssignmentRelationship ──────────────────────────────────────

describe("deriveShiftAssignmentRelationship", () => {
  it("Case A: scheduled + assigned → SCHEDULED_AND_ASSIGNED", () => {
    assert.equal(
      deriveShiftAssignmentRelationship({ hasActiveShift: true, hasActiveAssignment: true }),
      "SCHEDULED_AND_ASSIGNED",
    );
  });

  it("Case B: scheduled + unassigned → SCHEDULED_UNASSIGNED", () => {
    assert.equal(
      deriveShiftAssignmentRelationship({ hasActiveShift: true, hasActiveAssignment: false }),
      "SCHEDULED_UNASSIGNED",
    );
  });

  it("Case C: assigned + unscheduled → ASSIGNED_UNSCHEDULED", () => {
    assert.equal(
      deriveShiftAssignmentRelationship({ hasActiveShift: false, hasActiveAssignment: true }),
      "ASSIGNED_UNSCHEDULED",
    );
  });

  it("Case D: neither → NEITHER", () => {
    assert.equal(
      deriveShiftAssignmentRelationship({ hasActiveShift: false, hasActiveAssignment: false }),
      "NEITHER",
    );
  });
});

// ─── formatShiftTimeWindow ───────────────────────────────────────────────────

describe("formatShiftTimeWindow", () => {
  it("formats clock-time window from plannedStart/End", () => {
    assert.equal(formatShiftTimeWindow({ plannedStart: "06:30", plannedEnd: "15:00" }), "06:30–15:00");
    assert.equal(formatShiftTimeWindow({ plannedStart: "11:00", plannedEnd: "19:30" }), "11:00–19:30");
  });

  it("returns null when either time is missing", () => {
    assert.equal(formatShiftTimeWindow({ plannedStart: null, plannedEnd: "15:00" }), null);
    assert.equal(formatShiftTimeWindow({ plannedStart: "06:30", plannedEnd: null }), null);
    assert.equal(formatShiftTimeWindow({ plannedStart: null, plannedEnd: null }), null);
  });

  it("structurally supports overnight interval (23:00–07:00 is valid as strings)", () => {
    // Architecture does not block overnight intervals at string level.
    assert.equal(formatShiftTimeWindow({ plannedStart: "23:00", plannedEnd: "07:00" }), "23:00–07:00");
  });
});

// ─── buildEmployeeShiftProjection ────────────────────────────────────────────

describe("buildEmployeeShiftProjection", () => {
  it("Shift presence is independent from Daily Assignment (B: scheduled unassigned)", () => {
    const proj = buildEmployeeShiftProjection({
      ...BASE_EMPLOYEE,
      scheduleEntries: [makeShiftEntry()],
      operationalAssignments: [],
    });
    assert.equal(proj.relationship, "SCHEDULED_UNASSIGNED");
    assert.equal(proj.shifts.length, 1);
    assert.equal(proj.assignments.length, 0);
    assert.equal(proj.shifts[0]!.plannedStart, "06:30");
    assert.equal(proj.shifts[0]!.plannedEnd, "15:00");
  });

  it("Case A: scheduled + assigned → SCHEDULED_AND_ASSIGNED with full details", () => {
    const proj = buildEmployeeShiftProjection({
      ...BASE_EMPLOYEE,
      scheduleEntries: [makeShiftEntry()],
      operationalAssignments: [makeAssignment()],
    });
    assert.equal(proj.relationship, "SCHEDULED_AND_ASSIGNED");
    assert.equal(proj.assignments[0]!.scopeSummaryLabel, "Floors 1 & 2");
    assert.equal(proj.assignments[0]!.roleLabel, "Resident Services Supervisor");
  });

  it("Case C: assigned without schedule → ASSIGNED_UNSCHEDULED (emergency coverage)", () => {
    const proj = buildEmployeeShiftProjection({
      ...BASE_EMPLOYEE,
      scheduleEntries: [],
      operationalAssignments: [makeAssignment()],
    });
    assert.equal(proj.relationship, "ASSIGNED_UNSCHEDULED");
  });

  it("Case D: neither scheduled nor assigned → NEITHER", () => {
    const proj = buildEmployeeShiftProjection({
      ...BASE_EMPLOYEE,
      scheduleEntries: [],
      operationalAssignments: [],
    });
    assert.equal(proj.relationship, "NEITHER");
  });

  it("CANCELLED and COMPLETED assignments are excluded from active summary", () => {
    const proj = buildEmployeeShiftProjection({
      ...BASE_EMPLOYEE,
      scheduleEntries: [makeShiftEntry()],
      operationalAssignments: [
        makeAssignment({ id: "oa-cancelled", status: "CANCELLED" }),
        makeAssignment({ id: "oa-completed", status: "COMPLETED" }),
      ],
    });
    assert.equal(proj.assignments.length, 0);
    assert.equal(proj.relationship, "SCHEDULED_UNASSIGNED");
  });

  it("Department ownership is reflected in shift projection", () => {
    const proj = buildEmployeeShiftProjection({
      ...BASE_EMPLOYEE,
      scheduleEntries: [makeShiftEntry({ departmentId: "dept-dietary" })],
      operationalAssignments: [],
    });
    assert.equal(proj.shifts[0]!.departmentId, "dept-dietary");
  });

  it("Legacy rows (null departmentId, null unitId) remain readable", () => {
    const proj = buildEmployeeShiftProjection({
      ...BASE_EMPLOYEE,
      scheduleEntries: [makeShiftEntry({ departmentId: null, unitId: "legacy-unit-1", plannedStart: null, plannedEnd: null })],
      operationalAssignments: [],
    });
    assert.equal(proj.shifts[0]!.departmentId, null);
    assert.equal(proj.shifts[0]!.legacyUnitId, "legacy-unit-1");
    assert.equal(proj.shifts[0]!.plannedStart, null);
    // Still counts as presence even without clock times.
    assert.equal(proj.relationship, "SCHEDULED_UNASSIGNED");
  });

  it("Job Role display name and Team come from BUILD, not stored on Shift", () => {
    const proj = buildEmployeeShiftProjection({
      ...BASE_EMPLOYEE,
      scheduleEntries: [makeShiftEntry()],
      operationalAssignments: [],
    });
    assert.equal(proj.jobRoleDisplayName, "Resident Services Supervisor");
    assert.equal(proj.teamDisplayName, "Resident Services");
    // Job Role display is not stored inside the shift itself.
    assert.equal(proj.shifts[0]!.shiftSlot, "FULL_DAY");
  });

  it("Multiple shifts for same service date are all included", () => {
    const proj = buildEmployeeShiftProjection({
      ...BASE_EMPLOYEE,
      scheduleEntries: [
        makeShiftEntry({ id: "se-am", plannedStart: "06:30", plannedEnd: "15:00" }),
        makeShiftEntry({ id: "se-pm", plannedStart: "15:00", plannedEnd: "23:00" }),
      ],
      operationalAssignments: [],
    });
    assert.equal(proj.shifts.length, 2);
    assert.equal(proj.relationship, "SCHEDULED_UNASSIGNED");
  });

  it("meal-slot shiftSlot is carried as compatibility field but not primary semantics", () => {
    const proj = buildEmployeeShiftProjection({
      ...BASE_EMPLOYEE,
      scheduleEntries: [makeShiftEntry({ shift: "BREAKFAST", plannedStart: null, plannedEnd: null })],
      operationalAssignments: [],
    });
    // shiftSlot is compatibility metadata, not the canonical presence fact.
    assert.equal(proj.shifts[0]!.shiftSlot, "BREAKFAST");
    // Still counts as scheduled presence.
    assert.equal(proj.relationship, "SCHEDULED_UNASSIGNED");
  });
});
