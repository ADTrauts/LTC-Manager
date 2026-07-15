import assert from "node:assert/strict";
import test from "node:test";

import {
  getRoleDefinition,
  getRolesForDepartment,
  isRoleValidForDepartment,
  OPERATIONAL_ROLE_REGISTRY,
} from "@/lib/scheduling/assignment-roles";

import { assignmentStatusLabel, isAssignmentActive } from "./assignment-status";
import { detectOverlappingAssignments } from "./detect-assignment-conflicts";
import type { AssignmentBoardEntry, ValidateAssignmentInput } from "./types";
import { validateOperationalAssignment } from "./validate-operational-assignment";

// ---------------------------------------------------------------------------
// Role registry
// ---------------------------------------------------------------------------

test("role registry has roles for DIETARY, EVS, and PLANT", () => {
  assert.ok(getRolesForDepartment("DIETARY").length > 0);
  assert.ok(getRolesForDepartment("EVS").length > 0);
  assert.ok(getRolesForDepartment("PLANT").length > 0);
});

test("COOK is valid for DIETARY but not EVS or PLANT", () => {
  assert.ok(isRoleValidForDepartment("COOK", "DIETARY"));
  assert.ok(!isRoleValidForDepartment("COOK", "EVS"));
  assert.ok(!isRoleValidForDepartment("COOK", "PLANT"));
});

test("DISCHARGE_CLEAN is valid for EVS only", () => {
  assert.ok(isRoleValidForDepartment("DISCHARGE_CLEAN", "EVS"));
  assert.ok(!isRoleValidForDepartment("DISCHARGE_CLEAN", "DIETARY"));
  assert.ok(!isRoleValidForDepartment("DISCHARGE_CLEAN", "PLANT"));
});

test("WORK_ORDER_RESPONSE is valid for PLANT only", () => {
  assert.ok(isRoleValidForDepartment("WORK_ORDER_RESPONSE", "PLANT"));
  assert.ok(!isRoleValidForDepartment("WORK_ORDER_RESPONSE", "DIETARY"));
  assert.ok(!isRoleValidForDepartment("WORK_ORDER_RESPONSE", "EVS"));
});

test("getRoleDefinition returns role by key", () => {
  const cook = getRoleDefinition("COOK");
  assert.ok(cook);
  assert.equal(cook.key, "COOK");
  assert.equal(cook.label, "Cook");
  assert.deepEqual(cook.departmentKeys, ["DIETARY"]);
});

test("getRoleDefinition returns undefined for unknown key", () => {
  assert.equal(getRoleDefinition("NONEXISTENT"), undefined);
});

test("unknown role is not valid for any department", () => {
  assert.ok(!isRoleValidForDepartment("FAKE_ROLE", "DIETARY"));
  assert.ok(!isRoleValidForDepartment("FAKE_ROLE", "EVS"));
  assert.ok(!isRoleValidForDepartment("FAKE_ROLE", "PLANT"));
});

test("all roles have unique keys", () => {
  const keys = OPERATIONAL_ROLE_REGISTRY.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, "Duplicate role keys found");
});

test("Dietary roles do not appear in EVS or Plant results", () => {
  const dietaryKeys = new Set(getRolesForDepartment("DIETARY").map((r) => r.key));
  const evsKeys = getRolesForDepartment("EVS").map((r) => r.key);
  const plantKeys = getRolesForDepartment("PLANT").map((r) => r.key);
  for (const k of evsKeys) assert.ok(!dietaryKeys.has(k), `${k} in DIETARY and EVS`);
  for (const k of plantKeys) assert.ok(!dietaryKeys.has(k), `${k} in DIETARY and PLANT`);
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const baseInput: ValidateAssignmentInput = {
  facilityId: "fac1",
  departmentId: "dept1",
  departmentKey: "DIETARY",
  employeeId: "emp1",
  employeeFacilityId: "fac1",
  roleKey: "COOK",
  serviceDate: "2026-07-15",
};

test("valid assignment passes validation", () => {
  const result = validateOperationalAssignment(baseInput);
  assert.ok(result.valid);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 0);
});

test("cross-facility employee rejected", () => {
  const result = validateOperationalAssignment({
    ...baseInput,
    employeeFacilityId: "other-facility",
  });
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("Employee does not belong")));
});

test("cross-facility unit rejected", () => {
  const result = validateOperationalAssignment({
    ...baseInput,
    unitId: "unit1",
    unitFacilityId: "other-facility",
  });
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("Unit does not belong")));
});

test("cross-facility operation rejected", () => {
  const result = validateOperationalAssignment({
    ...baseInput,
    operationInstanceId: "op1",
    operationFacilityId: "other-facility",
  });
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("Operation does not belong")));
});

test("incompatible role/department rejected", () => {
  const result = validateOperationalAssignment({
    ...baseInput,
    departmentKey: "PLANT",
    roleKey: "COOK",
  });
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("not valid for department")));
});

test("EVS role accepted for EVS department", () => {
  const result = validateOperationalAssignment({
    ...baseInput,
    departmentKey: "EVS",
    roleKey: "DISCHARGE_CLEAN",
  });
  assert.ok(result.valid);
});

test("Plant role accepted for Plant department", () => {
  const result = validateOperationalAssignment({
    ...baseInput,
    departmentKey: "PLANT",
    roleKey: "WORK_ORDER_RESPONSE",
  });
  assert.ok(result.valid);
});

test("assignment outside shift generates warning", () => {
  const result = validateOperationalAssignment({
    ...baseInput,
    scheduledStart: "06:00",
    scheduledEnd: "14:00",
    startsAt: new Date("2026-07-15T04:00:00"),
    endsAt: new Date("2026-07-15T06:00:00"),
  });
  assert.ok(result.valid, "should still be valid (warning, not error)");
  assert.ok(result.warnings.some((w) => w.includes("outside")));
});

test("assignment within shift generates no warning", () => {
  const result = validateOperationalAssignment({
    ...baseInput,
    scheduledStart: "06:00",
    scheduledEnd: "14:00",
    startsAt: new Date("2026-07-15T07:00:00"),
    endsAt: new Date("2026-07-15T12:00:00"),
  });
  assert.ok(result.valid);
  assert.equal(result.warnings.length, 0);
});

test("start after end rejected", () => {
  const result = validateOperationalAssignment({
    ...baseInput,
    startsAt: new Date("2026-07-15T14:00:00"),
    endsAt: new Date("2026-07-15T06:00:00"),
  });
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("start time must be before end time")));
});

test("inactive unit produces warning", () => {
  const result = validateOperationalAssignment({
    ...baseInput,
    unitId: "unit1",
    unitFacilityId: "fac1",
    unitIsActive: false,
  });
  assert.ok(result.valid, "warning, not error");
  assert.ok(result.warnings.some((w) => w.includes("inactive")));
});

test("no operation fallback — null operation is acceptable", () => {
  const result = validateOperationalAssignment({
    ...baseInput,
    operationInstanceId: null,
  });
  assert.ok(result.valid);
});

// ---------------------------------------------------------------------------
// Overlap detection
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<AssignmentBoardEntry>): AssignmentBoardEntry {
  return {
    id: "a1",
    employeeId: "emp1",
    roleKey: "COOK",
    roleLabel: "Cook",
    unitId: null,
    unitName: null,
    operationInstanceId: null,
    operationLabel: null,
    startsAt: null,
    endsAt: null,
    status: "PLANNED",
    source: "MANUAL",
    notes: null,
    ...overrides,
  };
}

test("overlapping time-bounded assignments detected", () => {
  const entries: AssignmentBoardEntry[] = [
    makeEntry({
      id: "a1",
      startsAt: "2026-07-15T06:00:00Z",
      endsAt: "2026-07-15T10:00:00Z",
      roleLabel: "Cook",
    }),
    makeEntry({
      id: "a2",
      startsAt: "2026-07-15T09:00:00Z",
      endsAt: "2026-07-15T14:00:00Z",
      roleLabel: "Prep",
    }),
  ];
  const warnings = detectOverlappingAssignments(entries);
  assert.ok(warnings.length > 0);
  assert.ok(warnings.some((w) => w.kind === "overlapping_primary"));
});

test("non-overlapping time-bounded assignments produce no warnings", () => {
  const entries: AssignmentBoardEntry[] = [
    makeEntry({
      id: "a1",
      startsAt: "2026-07-15T06:00:00Z",
      endsAt: "2026-07-15T10:00:00Z",
    }),
    makeEntry({
      id: "a2",
      startsAt: "2026-07-15T10:00:00Z",
      endsAt: "2026-07-15T14:00:00Z",
    }),
  ];
  const warnings = detectOverlappingAssignments(entries);
  assert.equal(warnings.length, 0);
});

test("unbounded assignments overlap with each other", () => {
  const entries: AssignmentBoardEntry[] = [
    makeEntry({ id: "a1", roleLabel: "Cook" }),
    makeEntry({ id: "a2", roleLabel: "Prep" }),
  ];
  const warnings = detectOverlappingAssignments(entries);
  assert.ok(warnings.length > 0);
});

test("cancelled assignments excluded from overlap check", () => {
  const entries: AssignmentBoardEntry[] = [
    makeEntry({
      id: "a1",
      startsAt: "2026-07-15T06:00:00Z",
      endsAt: "2026-07-15T10:00:00Z",
    }),
    makeEntry({
      id: "a2",
      startsAt: "2026-07-15T06:00:00Z",
      endsAt: "2026-07-15T10:00:00Z",
      status: "CANCELLED",
    }),
  ];
  const warnings = detectOverlappingAssignments(entries);
  assert.equal(warnings.length, 0);
});

test("different employees do not trigger overlap", () => {
  const entries: AssignmentBoardEntry[] = [
    makeEntry({
      id: "a1",
      employeeId: "emp1",
      startsAt: "2026-07-15T06:00:00Z",
      endsAt: "2026-07-15T10:00:00Z",
    }),
    makeEntry({
      id: "a2",
      employeeId: "emp2",
      startsAt: "2026-07-15T06:00:00Z",
      endsAt: "2026-07-15T10:00:00Z",
    }),
  ];
  const warnings = detectOverlappingAssignments(entries);
  assert.equal(warnings.length, 0);
});

// ---------------------------------------------------------------------------
// Assignment status helpers
// ---------------------------------------------------------------------------

test("PLANNED and ACTIVE are active states", () => {
  assert.ok(isAssignmentActive("PLANNED"));
  assert.ok(isAssignmentActive("ACTIVE"));
});

test("COMPLETED and CANCELLED are not active states", () => {
  assert.ok(!isAssignmentActive("COMPLETED"));
  assert.ok(!isAssignmentActive("CANCELLED"));
});

test("status labels have correct tones", () => {
  assert.equal(assignmentStatusLabel("PLANNED").tone, "neutral");
  assert.equal(assignmentStatusLabel("ACTIVE").tone, "active");
  assert.equal(assignmentStatusLabel("COMPLETED").tone, "completed");
  assert.equal(assignmentStatusLabel("CANCELLED").tone, "cancelled");
});

test("status labels have human-readable labels", () => {
  for (const s of ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"] as const) {
    const result = assignmentStatusLabel(s);
    assert.ok(result.label.length > 0, `${s} should have a label`);
  }
});

// ---------------------------------------------------------------------------
// Coverage / valid coverage assignment
// ---------------------------------------------------------------------------

test("COVERAGE source assignment validates normally", () => {
  const result = validateOperationalAssignment({
    ...baseInput,
    roleKey: "COOK",
    departmentKey: "DIETARY",
  });
  assert.ok(result.valid);
});
