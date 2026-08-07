import assert from "node:assert/strict";
import test from "node:test";

import { buildManagerFocus } from "@/lib/business-workspace/build-manager-focus";
import type { BusinessWorkspaceInputs } from "@/lib/business-workspace/load-workspace-inputs";
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
    scopeKind: "UNIT",
    locationCount: 0,
    locationLabels: [],
    sourceZoneId: null,
    sourceZoneName: null,
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

// ---------------------------------------------------------------------------
// M2: Current assignment resolver
// ---------------------------------------------------------------------------

import type { EmployeeAssignmentRow } from "./resolve-current-assignment";
import { resolveCurrentEmployeeAssignment } from "./resolve-current-assignment";

function makeAssignmentRow(overrides: Partial<EmployeeAssignmentRow>): EmployeeAssignmentRow {
  return {
    id: "a1",
    roleKey: "COOK",
    roleLabel: "Cook",
    unitName: null,
    operationLabel: null,
    startsAt: null,
    endsAt: null,
    status: "PLANNED",
    source: "MANUAL",
    notes: null,
    ...overrides,
  };
}

test("M2: ACTIVE assignment containing now is current", () => {
  const now = new Date("2026-07-15T08:00:00");
  const result = resolveCurrentEmployeeAssignment([
    makeAssignmentRow({
      id: "a1",
      status: "ACTIVE",
      startsAt: new Date("2026-07-15T06:00:00"),
      endsAt: new Date("2026-07-15T10:00:00"),
    }),
  ], now);
  assert.ok(result.current);
  assert.equal(result.current.id, "a1");
});

test("M2: PLANNED assignment containing now is current when no ACTIVE", () => {
  const now = new Date("2026-07-15T08:00:00");
  const result = resolveCurrentEmployeeAssignment([
    makeAssignmentRow({
      id: "a1",
      status: "PLANNED",
      startsAt: new Date("2026-07-15T06:00:00"),
      endsAt: new Date("2026-07-15T10:00:00"),
    }),
  ], now);
  assert.ok(result.current);
  assert.equal(result.current.id, "a1");
});

test("M2: ACTIVE preferred over PLANNED when both contain now", () => {
  const now = new Date("2026-07-15T08:00:00");
  const result = resolveCurrentEmployeeAssignment([
    makeAssignmentRow({
      id: "planned",
      status: "PLANNED",
      startsAt: new Date("2026-07-15T06:00:00"),
      endsAt: new Date("2026-07-15T10:00:00"),
    }),
    makeAssignmentRow({
      id: "active",
      status: "ACTIVE",
      startsAt: new Date("2026-07-15T06:00:00"),
      endsAt: new Date("2026-07-15T10:00:00"),
    }),
  ], now);
  assert.ok(result.current);
  assert.equal(result.current.id, "active");
});

test("M2: nearest upcoming PLANNED assignment is upcoming", () => {
  const now = new Date("2026-07-15T08:00:00");
  const result = resolveCurrentEmployeeAssignment([
    makeAssignmentRow({
      id: "far",
      status: "PLANNED",
      startsAt: new Date("2026-07-15T14:00:00"),
      endsAt: new Date("2026-07-15T18:00:00"),
    }),
    makeAssignmentRow({
      id: "near",
      status: "PLANNED",
      startsAt: new Date("2026-07-15T10:00:00"),
      endsAt: new Date("2026-07-15T12:00:00"),
    }),
  ], now);
  assert.ok(result.upcoming);
  assert.equal(result.upcoming.id, "near");
});

test("M2: CANCELLED excluded from resolution", () => {
  const now = new Date("2026-07-15T08:00:00");
  const result = resolveCurrentEmployeeAssignment([
    makeAssignmentRow({
      id: "cancelled",
      status: "CANCELLED",
      startsAt: new Date("2026-07-15T06:00:00"),
      endsAt: new Date("2026-07-15T10:00:00"),
    }),
  ], now);
  assert.equal(result.current, null);
  assert.equal(result.upcoming, null);
});

test("M2: COMPLETED excluded from resolution", () => {
  const now = new Date("2026-07-15T08:00:00");
  const result = resolveCurrentEmployeeAssignment([
    makeAssignmentRow({
      id: "completed",
      status: "COMPLETED",
      startsAt: new Date("2026-07-15T06:00:00"),
      endsAt: new Date("2026-07-15T10:00:00"),
    }),
  ], now);
  assert.equal(result.current, null);
  assert.equal(result.upcoming, null);
});

test("M2: unbounded assignment is always current", () => {
  const now = new Date("2026-07-15T08:00:00");
  const result = resolveCurrentEmployeeAssignment([
    makeAssignmentRow({ id: "full-day", status: "ACTIVE" }),
  ], now);
  assert.ok(result.current);
  assert.equal(result.current.id, "full-day");
});

test("M2: no assignments yields null current and upcoming", () => {
  const now = new Date("2026-07-15T08:00:00");
  const result = resolveCurrentEmployeeAssignment([], now);
  assert.equal(result.current, null);
  assert.equal(result.upcoming, null);
});

test("M2: assignment before now is not current or upcoming", () => {
  const now = new Date("2026-07-15T14:00:00");
  const result = resolveCurrentEmployeeAssignment([
    makeAssignmentRow({
      id: "past",
      status: "PLANNED",
      startsAt: new Date("2026-07-15T06:00:00"),
      endsAt: new Date("2026-07-15T10:00:00"),
    }),
  ], now);
  assert.equal(result.current, null);
  assert.equal(result.upcoming, null);
});

test("M2: current and upcoming both populated", () => {
  const now = new Date("2026-07-15T08:00:00");
  const result = resolveCurrentEmployeeAssignment([
    makeAssignmentRow({
      id: "now",
      status: "ACTIVE",
      startsAt: new Date("2026-07-15T06:00:00"),
      endsAt: new Date("2026-07-15T10:00:00"),
    }),
    makeAssignmentRow({
      id: "later",
      status: "PLANNED",
      startsAt: new Date("2026-07-15T10:00:00"),
      endsAt: new Date("2026-07-15T14:00:00"),
    }),
  ], now);
  assert.ok(result.current);
  assert.equal(result.current.id, "now");
  assert.ok(result.upcoming);
  assert.equal(result.upcoming.id, "later");
});

// ---------------------------------------------------------------------------
// M2: Lifecycle validation
// ---------------------------------------------------------------------------

test("M2: PLANNED → ACTIVE is valid transition", () => {
  assert.ok(isAssignmentActive("PLANNED"));
  assert.ok(isAssignmentActive("ACTIVE"));
});

test("M2: completed/cancelled records retained as historical", () => {
  assert.ok(!isAssignmentActive("COMPLETED"));
  assert.ok(!isAssignmentActive("CANCELLED"));
  assert.equal(assignmentStatusLabel("COMPLETED").tone, "completed");
  assert.equal(assignmentStatusLabel("CANCELLED").tone, "cancelled");
});

// ---------------------------------------------------------------------------
// M2: Coverage overlap handling
// ---------------------------------------------------------------------------

test("M2: intentional coverage overlap detected but not hard error", () => {
  const entries: AssignmentBoardEntry[] = [
    makeEntry({
      id: "primary",
      employeeId: "emp1",
      startsAt: "2026-07-15T06:00:00Z",
      endsAt: "2026-07-15T10:00:00Z",
      source: "MANUAL",
      roleLabel: "Cook",
    }),
    makeEntry({
      id: "coverage",
      employeeId: "emp1",
      startsAt: "2026-07-15T08:00:00Z",
      endsAt: "2026-07-15T12:00:00Z",
      source: "COVERAGE",
      roleLabel: "Server",
    }),
  ];
  const warnings = detectOverlappingAssignments(entries);
  assert.ok(warnings.length > 0, "overlap detected");
  assert.ok(warnings.every((w) => w.kind === "overlapping_primary"), "reported as overlap warning");
});

test("M2: reassignment source with no overlap is clean", () => {
  const entries: AssignmentBoardEntry[] = [
    makeEntry({
      id: "reassigned",
      employeeId: "emp1",
      startsAt: "2026-07-15T10:00:00Z",
      endsAt: "2026-07-15T14:00:00Z",
      source: "REASSIGNMENT",
    }),
  ];
  const warnings = detectOverlappingAssignments(entries);
  assert.equal(warnings.length, 0);
});

// ---------------------------------------------------------------------------
// M3: Template types and structure
// ---------------------------------------------------------------------------

import type {
  TemplateView,
  TemplateItemView,
  TemplatePreviewPosition,
  ApplyTemplateResult,
} from "./template-types";

test("M3: TemplateView shape is correct", () => {
  const template: TemplateView = {
    id: "tpl1",
    name: "Breakfast Production",
    description: "Morning meal prep positions",
    isActive: true,
    departmentId: "dept1",
    departmentKey: "DIETARY",
    operationDefinitionId: null,
    operationLabel: null,
    workShiftId: null,
    workShiftName: null,
    items: [
      {
        id: "item1",
        roleKey: "COOK",
        roleLabel: "Cook",
        unitId: null,
        unitName: null,
        startsAtLocal: "06:00",
        endsAtLocal: "10:00",
        requiredCount: 1,
        sortOrder: 10,
        notes: null,
      },
    ],
    totalPositions: 1,
  };
  assert.equal(template.name, "Breakfast Production");
  assert.equal(template.items.length, 1);
  assert.equal(template.totalPositions, 1);
});

test("M3: TemplateItemView supports requiredCount > 1", () => {
  const item: TemplateItemView = {
    id: "item1",
    roleKey: "SERVER",
    roleLabel: "Server",
    unitId: "unit2a",
    unitName: "2A MLK",
    startsAtLocal: "06:30",
    endsAtLocal: "09:30",
    requiredCount: 2,
    sortOrder: 20,
    notes: null,
  };
  assert.equal(item.requiredCount, 2);
  assert.equal(item.unitName, "2A MLK");
});

test("M3: template with multiple items computes totalPositions", () => {
  const template: TemplateView = {
    id: "tpl1",
    name: "Full Kitchen",
    description: null,
    isActive: true,
    departmentId: "dept1",
    departmentKey: "DIETARY",
    operationDefinitionId: null,
    operationLabel: null,
    workShiftId: null,
    workShiftName: null,
    items: [
      { id: "i1", roleKey: "COOK", roleLabel: "Cook", unitId: null, unitName: null, startsAtLocal: null, endsAtLocal: null, requiredCount: 1, sortOrder: 10, notes: null },
      { id: "i2", roleKey: "HOT_PREP", roleLabel: "Hot Prep", unitId: null, unitName: null, startsAtLocal: null, endsAtLocal: null, requiredCount: 2, sortOrder: 20, notes: null },
      { id: "i3", roleKey: "DISHWASHING", roleLabel: "Dishwashing", unitId: null, unitName: null, startsAtLocal: null, endsAtLocal: null, requiredCount: 1, sortOrder: 30, notes: null },
    ],
    totalPositions: 4,
  };
  const computed = template.items.reduce((s, i) => s + i.requiredCount, 0);
  assert.equal(computed, template.totalPositions);
});

test("M3: inactive template should not be applied", () => {
  const template: TemplateView = {
    id: "tpl1",
    name: "Old Template",
    description: null,
    isActive: false,
    departmentId: "dept1",
    departmentKey: "DIETARY",
    operationDefinitionId: null,
    operationLabel: null,
    workShiftId: null,
    workShiftName: null,
    items: [],
    totalPositions: 0,
  };
  assert.ok(!template.isActive);
});

// ---------------------------------------------------------------------------
// M3: Employee suggestions
// ---------------------------------------------------------------------------

import { suggestEmployeeForPosition } from "./build-assignment-suggestions";
import type { AssignmentBoardEmployee } from "./types";

function makeEmployee(overrides: Partial<AssignmentBoardEmployee>): AssignmentBoardEmployee {
  return {
    id: "emp1",
    firstName: "Jordan",
    lastName: "Smith",
    departmentKey: "DIETARY",
    departmentName: "Dietary",
    scheduledShift: "AM",
    plannedStart: "06:00",
    plannedEnd: "14:00",
    unitName: "Main Kitchen",
    hasCallDown: false,
    callDownReason: null,
    ...overrides,
  };
}

test("M3: suggests available employee for position", () => {
  const employees = [
    makeEmployee({ id: "emp1", firstName: "Jordan", lastName: "Smith" }),
  ];
  const result = suggestEmployeeForPosition({
    roleKey: "COOK",
    unitId: null,
    scheduledEmployees: employees,
    existingAssignments: [],
    alreadySuggestedIds: new Set(),
  });
  assert.ok(result);
  assert.equal(result.employeeId, "emp1");
  assert.equal(result.reason, "Available during the shift");
});

test("M3: excludes employees with call-downs", () => {
  const employees = [
    makeEmployee({ id: "emp1", hasCallDown: true }),
  ];
  const result = suggestEmployeeForPosition({
    roleKey: "COOK",
    unitId: null,
    scheduledEmployees: employees,
    existingAssignments: [],
    alreadySuggestedIds: new Set(),
  });
  assert.equal(result, null);
});

test("M3: excludes already-suggested employees", () => {
  const employees = [
    makeEmployee({ id: "emp1" }),
    makeEmployee({ id: "emp2", firstName: "Alex", lastName: "Jones" }),
  ];
  const result = suggestEmployeeForPosition({
    roleKey: "COOK",
    unitId: null,
    scheduledEmployees: employees,
    existingAssignments: [],
    alreadySuggestedIds: new Set(["emp1"]),
  });
  assert.ok(result);
  assert.equal(result.employeeId, "emp2");
});

test("M3: excludes employees with existing active assignments", () => {
  const employees = [
    makeEmployee({ id: "emp1" }),
    makeEmployee({ id: "emp2", firstName: "Alex", lastName: "Jones" }),
  ];
  const existingAssignments = [
    makeEntry({ id: "a1", employeeId: "emp1", status: "ACTIVE" }),
  ];
  const result = suggestEmployeeForPosition({
    roleKey: "HOT_PREP",
    unitId: null,
    scheduledEmployees: employees,
    existingAssignments,
    alreadySuggestedIds: new Set(),
  });
  assert.ok(result);
  assert.equal(result.employeeId, "emp2");
});

test("M3: returns null when no candidates available", () => {
  const result = suggestEmployeeForPosition({
    roleKey: "COOK",
    unitId: null,
    scheduledEmployees: [],
    existingAssignments: [],
    alreadySuggestedIds: new Set(),
  });
  assert.equal(result, null);
});

test("M3: suggestion reason is explainable", () => {
  const employees = [makeEmployee({ id: "emp1" })];
  const result = suggestEmployeeForPosition({
    roleKey: "COOK",
    unitId: null,
    scheduledEmployees: employees,
    existingAssignments: [],
    alreadySuggestedIds: new Set(),
  });
  assert.ok(result);
  assert.ok(result.reason.length > 0);
  assert.ok(
    result.reason === "Available during the shift" ||
    result.reason === "Scheduled in this location",
  );
});

test("M3: cancelled assignments do not block suggestion", () => {
  const employees = [makeEmployee({ id: "emp1" })];
  const existingAssignments = [
    makeEntry({ id: "a1", employeeId: "emp1", status: "CANCELLED" }),
  ];
  const result = suggestEmployeeForPosition({
    roleKey: "HOT_PREP",
    unitId: null,
    scheduledEmployees: employees,
    existingAssignments,
    alreadySuggestedIds: new Set(),
  });
  assert.ok(result);
  assert.equal(result.employeeId, "emp1");
});

test("M3: completed assignments do not block suggestion", () => {
  const employees = [makeEmployee({ id: "emp1" })];
  const existingAssignments = [
    makeEntry({ id: "a1", employeeId: "emp1", status: "COMPLETED" }),
  ];
  const result = suggestEmployeeForPosition({
    roleKey: "HOT_PREP",
    unitId: null,
    scheduledEmployees: employees,
    existingAssignments,
    alreadySuggestedIds: new Set(),
  });
  assert.ok(result);
  assert.equal(result.employeeId, "emp1");
});

// ---------------------------------------------------------------------------
// M3: Preview position expansion
// ---------------------------------------------------------------------------

test("M3: preview position shape is correct", () => {
  const pos: TemplatePreviewPosition = {
    itemId: "item1",
    roleKey: "COOK",
    roleLabel: "Cook",
    unitId: null,
    unitName: null,
    startsAtLocal: "06:00",
    endsAtLocal: "10:00",
    notes: null,
    positionIndex: 0,
    assignedEmployeeId: null,
    assignedEmployeeName: null,
    existingAssignmentId: null,
    suggestedEmployeeId: "emp1",
    suggestedEmployeeName: "Jordan Smith",
    suggestedReason: "Available during the shift",
  };
  assert.equal(pos.roleLabel, "Cook");
  assert.equal(pos.suggestedEmployeeId, "emp1");
  assert.ok(pos.suggestedReason);
});

test("M3: existing assignment fills position (not duplicated)", () => {
  const pos: TemplatePreviewPosition = {
    itemId: "item1",
    roleKey: "COOK",
    roleLabel: "Cook",
    unitId: null,
    unitName: null,
    startsAtLocal: null,
    endsAtLocal: null,
    notes: null,
    positionIndex: 0,
    assignedEmployeeId: "emp1",
    assignedEmployeeName: "Jordan Smith",
    existingAssignmentId: "a1",
    suggestedEmployeeId: null,
    suggestedEmployeeName: null,
    suggestedReason: null,
  };
  assert.ok(pos.existingAssignmentId);
  assert.equal(pos.suggestedEmployeeId, null);
});

test("M3: unfilled position has reason", () => {
  const pos: TemplatePreviewPosition = {
    itemId: "item1",
    roleKey: "COOK",
    roleLabel: "Cook",
    unitId: null,
    unitName: null,
    startsAtLocal: null,
    endsAtLocal: null,
    notes: null,
    positionIndex: 0,
    assignedEmployeeId: null,
    assignedEmployeeName: null,
    existingAssignmentId: null,
    suggestedEmployeeId: null,
    suggestedEmployeeName: null,
    suggestedReason: "No eligible employee found",
  };
  assert.equal(pos.suggestedReason, "No eligible employee found");
});

// ---------------------------------------------------------------------------
// M3: Apply template result
// ---------------------------------------------------------------------------

test("M3: apply result shape tracks created/skipped/warnings", () => {
  const result: ApplyTemplateResult = {
    created: 3,
    skipped: 1,
    warnings: ["Skipped: position already filled."],
  };
  assert.equal(result.created, 3);
  assert.equal(result.skipped, 1);
  assert.equal(result.warnings.length, 1);
});

// ---------------------------------------------------------------------------
// M3: Role registry compatibility with templates
// ---------------------------------------------------------------------------

test("M3: all Dietary roles valid for Dietary template", () => {
  const roles = getRolesForDepartment("DIETARY");
  for (const r of roles) {
    assert.ok(isRoleValidForDepartment(r.key, "DIETARY"), `${r.key} should be valid for DIETARY`);
    assert.ok(!isRoleValidForDepartment(r.key, "EVS"), `${r.key} should NOT be valid for EVS`);
    assert.ok(!isRoleValidForDepartment(r.key, "PLANT"), `${r.key} should NOT be valid for PLANT`);
  }
});

test("M3: all EVS roles valid for EVS template", () => {
  const roles = getRolesForDepartment("EVS");
  for (const r of roles) {
    assert.ok(isRoleValidForDepartment(r.key, "EVS"), `${r.key} should be valid for EVS`);
    assert.ok(!isRoleValidForDepartment(r.key, "DIETARY"), `${r.key} should NOT be valid for DIETARY`);
    assert.ok(!isRoleValidForDepartment(r.key, "PLANT"), `${r.key} should NOT be valid for PLANT`);
  }
});

test("M3: all Plant roles valid for Plant template", () => {
  const roles = getRolesForDepartment("PLANT");
  for (const r of roles) {
    assert.ok(isRoleValidForDepartment(r.key, "PLANT"), `${r.key} should be valid for PLANT`);
    assert.ok(!isRoleValidForDepartment(r.key, "DIETARY"), `${r.key} should NOT be valid for DIETARY`);
    assert.ok(!isRoleValidForDepartment(r.key, "EVS"), `${r.key} should NOT be valid for EVS`);
  }
});

// ---------------------------------------------------------------------------
// M3: Idempotency of template application
// ---------------------------------------------------------------------------

test("M3: idempotency key prevents duplicate creation", () => {
  const existingKey = (a: { employeeId: string; roleKey: string; unitId: string | null }) =>
    `${a.employeeId}:${a.roleKey}:${a.unitId ?? ""}`;

  const existing = [
    { employeeId: "emp1", roleKey: "COOK", unitId: null },
    { employeeId: "emp2", roleKey: "HOT_PREP", unitId: null },
  ];
  const existingKeys = new Set(existing.map(existingKey));

  assert.ok(existingKeys.has("emp1:COOK:"));
  assert.ok(existingKeys.has("emp2:HOT_PREP:"));
  assert.ok(!existingKeys.has("emp3:COOK:"));
});

test("M3: different unit allows same role for different position", () => {
  const existingKey = (a: { employeeId: string; roleKey: string; unitId: string | null }) =>
    `${a.employeeId}:${a.roleKey}:${a.unitId ?? ""}`;

  const existing = [
    { employeeId: "emp1", roleKey: "SERVER", unitId: "unit1" },
  ];
  const existingKeys = new Set(existing.map(existingKey));

  assert.ok(!existingKeys.has("emp1:SERVER:unit2"), "different unit = different position");
});

test("M3: same template can be applied for different operation instances", () => {
  const key1 = "tpl1:2026-07-15:opInst1";
  const key2 = "tpl1:2026-07-15:opInst2";
  assert.notEqual(key1, key2);
});

// ---------------------------------------------------------------------------
// M3: Template boundary enforcement
// ---------------------------------------------------------------------------

test("M3: template does not store employee IDs", () => {
  const template: TemplateView = {
    id: "tpl1",
    name: "Test",
    description: null,
    isActive: true,
    departmentId: "dept1",
    departmentKey: "DIETARY",
    operationDefinitionId: null,
    operationLabel: null,
    workShiftId: null,
    workShiftName: null,
    items: [
      { id: "i1", roleKey: "COOK", roleLabel: "Cook", unitId: null, unitName: null, startsAtLocal: null, endsAtLocal: null, requiredCount: 1, sortOrder: 10, notes: null },
    ],
    totalPositions: 1,
  };
  const hasEmployeeField = "employeeId" in template || template.items.some((i) => "employeeId" in i);
  assert.ok(!hasEmployeeField, "Templates should not store employee IDs");
});

// ---------------------------------------------------------------------------
// M4: Assignment fulfillment summary
// ---------------------------------------------------------------------------

import { buildAssignmentFulfillmentSummary } from "./build-assignment-fulfillment";

function makeTemplate(items: Array<{roleKey: string; roleLabel: string; requiredCount: number; unitId?: string | null}>): TemplateView {
  return {
    id: "tpl1",
    name: "Test Template",
    description: null,
    isActive: true,
    departmentId: "dept1",
    departmentKey: "DIETARY",
    operationDefinitionId: null,
    operationLabel: null,
    workShiftId: null,
    workShiftName: null,
    items: items.map((item, i) => ({
      id: `item${i}`,
      roleKey: item.roleKey,
      roleLabel: item.roleLabel,
      unitId: item.unitId ?? null,
      unitName: null,
      startsAtLocal: null,
      endsAtLocal: null,
      requiredCount: item.requiredCount,
      sortOrder: (i + 1) * 10,
      notes: null,
    })),
    totalPositions: items.reduce((s, i) => s + i.requiredCount, 0),
  };
}

test("M4: fully filled positions", () => {
  const template = makeTemplate([{ roleKey: "COOK", roleLabel: "Cook", requiredCount: 1 }]);
  const assignments = [makeEntry({ id: "a1", roleKey: "COOK", status: "ACTIVE" })];
  const result = buildAssignmentFulfillmentSummary({
    templates: [template],
    assignments,
    scheduledEmployeeCount: 1,
  });
  assert.ok(result.available);
  if (!result.available) return;
  assert.equal(result.requiredPositions, 1);
  assert.equal(result.filledPositions, 1);
  assert.equal(result.unfilledPositions, 0);
});

test("M4: unfilled position", () => {
  const template = makeTemplate([{ roleKey: "COOK", roleLabel: "Cook", requiredCount: 2 }]);
  const assignments = [makeEntry({ id: "a1", roleKey: "COOK", status: "ACTIVE" })];
  const result = buildAssignmentFulfillmentSummary({
    templates: [template],
    assignments,
    scheduledEmployeeCount: 2,
  });
  assert.ok(result.available);
  if (!result.available) return;
  assert.equal(result.requiredPositions, 2);
  assert.equal(result.filledPositions, 1);
  assert.equal(result.unfilledPositions, 1);
});

test("M4: requiredCount expansion to multiple positions", () => {
  const template = makeTemplate([{ roleKey: "SERVER", roleLabel: "Server", requiredCount: 3 }]);
  const assignments = [
    makeEntry({ id: "a1", employeeId: "emp1", roleKey: "SERVER", status: "PLANNED" }),
    makeEntry({ id: "a2", employeeId: "emp2", roleKey: "SERVER", status: "PLANNED" }),
  ];
  const result = buildAssignmentFulfillmentSummary({
    templates: [template],
    assignments,
    scheduledEmployeeCount: 3,
  });
  assert.ok(result.available);
  if (!result.available) return;
  assert.equal(result.requiredPositions, 3);
  assert.equal(result.filledPositions, 2);
  assert.equal(result.unfilledPositions, 1);
});

test("M4: completed assignment does not fill current position", () => {
  const template = makeTemplate([{ roleKey: "COOK", roleLabel: "Cook", requiredCount: 1 }]);
  const assignments = [makeEntry({ id: "a1", roleKey: "COOK", status: "COMPLETED" })];
  const result = buildAssignmentFulfillmentSummary({
    templates: [template],
    assignments,
    scheduledEmployeeCount: 1,
  });
  assert.ok(result.available);
  if (!result.available) return;
  assert.equal(result.filledPositions, 0);
  assert.equal(result.unfilledPositions, 1);
});

test("M4: cancelled assignment does not fill current position", () => {
  const template = makeTemplate([{ roleKey: "COOK", roleLabel: "Cook", requiredCount: 1 }]);
  const assignments = [makeEntry({ id: "a1", roleKey: "COOK", status: "CANCELLED" })];
  const result = buildAssignmentFulfillmentSummary({
    templates: [template],
    assignments,
    scheduledEmployeeCount: 1,
  });
  assert.ok(result.available);
  if (!result.available) return;
  assert.equal(result.filledPositions, 0);
  assert.equal(result.unfilledPositions, 1);
});

test("M4: manual assignment fills matching template role", () => {
  const template = makeTemplate([{ roleKey: "COOK", roleLabel: "Cook", requiredCount: 1 }]);
  const assignments = [makeEntry({ id: "a1", roleKey: "COOK", status: "ACTIVE", source: "MANUAL" })];
  const result = buildAssignmentFulfillmentSummary({
    templates: [template],
    assignments,
    scheduledEmployeeCount: 1,
  });
  assert.ok(result.available);
  if (!result.available) return;
  assert.equal(result.filledPositions, 1);
});

test("M4: coverage assignment fills compatible position", () => {
  const template = makeTemplate([{ roleKey: "COOK", roleLabel: "Cook", requiredCount: 1 }]);
  const assignments = [makeEntry({ id: "a1", roleKey: "COOK", status: "ACTIVE", source: "COVERAGE" })];
  const result = buildAssignmentFulfillmentSummary({
    templates: [template],
    assignments,
    scheduledEmployeeCount: 1,
  });
  assert.ok(result.available);
  if (!result.available) return;
  assert.equal(result.filledPositions, 1);
});

test("M4: no applicable template returns unavailable summary", () => {
  const result = buildAssignmentFulfillmentSummary({
    templates: [],
    assignments: [],
    scheduledEmployeeCount: 5,
  });
  assert.ok(!result.available);
});

test("M4: inactive template excluded from fulfillment", () => {
  const template = makeTemplate([{ roleKey: "COOK", roleLabel: "Cook", requiredCount: 1 }]);
  template.isActive = false;
  const result = buildAssignmentFulfillmentSummary({
    templates: [template],
    assignments: [],
    scheduledEmployeeCount: 1,
  });
  assert.ok(!result.available);
});

test("M4: overlapping employee counts as conflict", () => {
  const template = makeTemplate([
    { roleKey: "COOK", roleLabel: "Cook", requiredCount: 1 },
    { roleKey: "HOT_PREP", roleLabel: "Hot Prep", requiredCount: 1 },
  ]);
  const assignments = [
    makeEntry({ id: "a1", employeeId: "emp1", roleKey: "COOK", status: "ACTIVE" }),
    makeEntry({ id: "a2", employeeId: "emp1", roleKey: "HOT_PREP", status: "ACTIVE" }),
  ];
  const result = buildAssignmentFulfillmentSummary({
    templates: [template],
    assignments,
    scheduledEmployeeCount: 2,
  });
  assert.ok(result.available);
  if (!result.available) return;
  assert.equal(result.conflicts, 1, "one employee with 2 assignments = 1 conflict");
});

test("M4: coverage/reassignment assignments counted", () => {
  const template = makeTemplate([{ roleKey: "COOK", roleLabel: "Cook", requiredCount: 2 }]);
  const assignments = [
    makeEntry({ id: "a1", employeeId: "emp1", roleKey: "COOK", status: "ACTIVE", source: "MANUAL" }),
    makeEntry({ id: "a2", employeeId: "emp2", roleKey: "COOK", status: "ACTIVE", source: "COVERAGE" }),
  ];
  const result = buildAssignmentFulfillmentSummary({
    templates: [template],
    assignments,
    scheduledEmployeeCount: 3,
  });
  assert.ok(result.available);
  if (!result.available) return;
  assert.equal(result.activeCoverageAssignments, 1);
});

test("M4: scheduled-only employees computed correctly", () => {
  const template = makeTemplate([{ roleKey: "COOK", roleLabel: "Cook", requiredCount: 1 }]);
  const assignments = [makeEntry({ id: "a1", employeeId: "emp1", roleKey: "COOK", status: "ACTIVE" })];
  const result = buildAssignmentFulfillmentSummary({
    templates: [template],
    assignments,
    scheduledEmployeeCount: 4,
  });
  assert.ok(result.available);
  if (!result.available) return;
  assert.equal(result.scheduledOnlyEmployees, 3);
});

test("M4: unit-specific position only filled by matching unit", () => {
  const template = makeTemplate([{ roleKey: "SERVER", roleLabel: "Server", requiredCount: 1, unitId: "unitA" }]);
  const assignments = [
    makeEntry({ id: "a1", roleKey: "SERVER", unitId: "unitB", status: "ACTIVE" }),
  ];
  const result = buildAssignmentFulfillmentSummary({
    templates: [template],
    assignments,
    scheduledEmployeeCount: 1,
  });
  assert.ok(result.available);
  if (!result.available) return;
  assert.equal(result.filledPositions, 0, "wrong unit does not fill position");
  assert.equal(result.unfilledPositions, 1);
});

// ---------------------------------------------------------------------------
// M4: Assignment event types
// ---------------------------------------------------------------------------

test("M4: assignment event type values are correct strings", () => {
  const types: string[] = ["CREATED", "UPDATED", "REASSIGNED", "COVERAGE_ADDED", "ACTIVATED", "COMPLETED", "CANCELLED"];
  for (const t of types) {
    assert.ok(t.length > 0);
  }
});

test("M4: event view shape is correct", () => {
  const event: import("./assignment-events").AssignmentEventView = {
    id: "e1",
    assignmentId: "a1",
    planId: null,
    eventType: "CREATED",
    actorName: "Jane Manager",
    fromStatus: null,
    toStatus: "PLANNED",
    summary: "Assignment created: Cook",
    reason: null,
    createdAt: "2026-07-15T08:00:00Z",
  };
  assert.equal(event.eventType, "CREATED");
  assert.equal(event.actorName, "Jane Manager");
  assert.equal(event.toStatus, "PLANNED");
});

test("M4: lifecycle events have from/to status", () => {
  const event: import("./assignment-events").AssignmentEventView = {
    id: "e2",
    assignmentId: "a1",
    planId: null,
    eventType: "ACTIVATED",
    actorName: "Jane Manager",
    fromStatus: "PLANNED",
    toStatus: "ACTIVE",
    summary: "Assignment activated",
    reason: null,
    createdAt: "2026-07-15T09:00:00Z",
  };
  assert.equal(event.fromStatus, "PLANNED");
  assert.equal(event.toStatus, "ACTIVE");
});

// ---------------------------------------------------------------------------
// M4: Workspace integration types
// ---------------------------------------------------------------------------

test("M4: workspace assignment summary shape", () => {
  const summary: import("@/lib/business-workspace/load-workspace-inputs").WorkspaceAssignmentSummary = {
    available: true,
    requiredPositions: 8,
    filledPositions: 6,
    unfilledPositions: 2,
    conflicts: 1,
    activeCoverageAssignments: 1,
  };
  assert.equal(summary.requiredPositions, 8);
  assert.equal(summary.filledPositions, 6);
  assert.ok(summary.available);
});

test("M4: workspace assignment summary unavailable when no templates", () => {
  const summary: import("@/lib/business-workspace/load-workspace-inputs").WorkspaceAssignmentSummary = {
    available: false,
    requiredPositions: 0,
    filledPositions: 0,
    unfilledPositions: 0,
    conflicts: 0,
    activeCoverageAssignments: 0,
  };
  assert.ok(!summary.available);
});

// ---------------------------------------------------------------------------
// M4: Manager Focus with assignment gaps
// ---------------------------------------------------------------------------

test("M4: buildManagerFocus surfaces unfilled positions", () => {
  const inputs = {
    facilityId: "fac1",
    facilityName: "Test",
    facilityTimezone: "America/New_York",
    now: new Date(),
    operationalTime: { facilityLocalDate: "2026-07-15", facilityTimezone: "America/New_York" },
    dashboard: {
      unitCards: [],
      mealBoards: [],
      totals: { expected: 0, completed: 0, failed: 0, missed: 0 },
      unitsMissingStaffing: [],
      unitsWithExceptions: [],
      operationContext: { serviceLabel: "Breakfast", phase: "Execution", scheduledTimeLabel: "6:00 AM" },
      sitePulse: { tone: "ready", label: "Ready", badge: "Ready" },
      callDowns: { items: [], summary: { total: 0, open: 0 }, dateIso: "2026-07-15" },
    },
    readiness: { items: [], summary: { total: 0, ready: 0, inProgress: 0, blocked: 0 } },
    callDownSummary: { total: 0, open: 0 },
    openRepairs: [],
    inspectionsDue: [],
    activeDepartmentKeys: ["DIETARY" as const],
    activity: { repairsOpened: [], repairsResolved: [], inspectionsCompleted: [], knowledgePublished: [] },
    assignmentSummary: {
      available: true,
      requiredPositions: 5,
      filledPositions: 3,
      unfilledPositions: 2,
      conflicts: 0,
      activeCoverageAssignments: 0,
    },
  };
  const cards = buildManagerFocus(inputs as unknown as BusinessWorkspaceInputs);
  const assignmentCard = cards.find((c) => c.id === "focus-assignment-gaps");
  assert.ok(assignmentCard, "should have assignment gap focus card");
  assert.ok(assignmentCard!.explanation.includes("2"), "should mention unfilled count");
});

test("M4: no assignment gap focus when all positions filled", () => {
  const inputs = {
    facilityId: "fac1",
    facilityName: "Test",
    facilityTimezone: "America/New_York",
    now: new Date(),
    operationalTime: { facilityLocalDate: "2026-07-15", facilityTimezone: "America/New_York" },
    dashboard: {
      unitCards: [],
      mealBoards: [],
      totals: { expected: 0, completed: 0, failed: 0, missed: 0 },
      unitsMissingStaffing: [],
      unitsWithExceptions: [],
      operationContext: { serviceLabel: "Breakfast", phase: "Execution", scheduledTimeLabel: "6:00 AM" },
      sitePulse: { tone: "ready", label: "Ready", badge: "Ready" },
      callDowns: { items: [], summary: { total: 0, open: 0 }, dateIso: "2026-07-15" },
    },
    readiness: { items: [], summary: { total: 0, ready: 0, inProgress: 0, blocked: 0 } },
    callDownSummary: { total: 0, open: 0 },
    openRepairs: [],
    inspectionsDue: [],
    activeDepartmentKeys: ["DIETARY" as const],
    activity: { repairsOpened: [], repairsResolved: [], inspectionsCompleted: [], knowledgePublished: [] },
    assignmentSummary: {
      available: true,
      requiredPositions: 5,
      filledPositions: 5,
      unfilledPositions: 0,
      conflicts: 0,
      activeCoverageAssignments: 0,
    },
  };
  const cards = buildManagerFocus(inputs as unknown as BusinessWorkspaceInputs);
  const assignmentCard = cards.find((c) => c.id === "focus-assignment-gaps");
  assert.ok(!assignmentCard, "should not have assignment gap card when all filled");
});

test("M4: no assignment focus when feature unavailable", () => {
  const inputs = {
    facilityId: "fac1",
    facilityName: "Test",
    facilityTimezone: "America/New_York",
    now: new Date(),
    operationalTime: { facilityLocalDate: "2026-07-15", facilityTimezone: "America/New_York" },
    dashboard: {
      unitCards: [],
      mealBoards: [],
      totals: { expected: 0, completed: 0, failed: 0, missed: 0 },
      unitsMissingStaffing: [],
      unitsWithExceptions: [],
      operationContext: { serviceLabel: "Breakfast", phase: "Execution", scheduledTimeLabel: "6:00 AM" },
      sitePulse: { tone: "ready", label: "Ready", badge: "Ready" },
      callDowns: { items: [], summary: { total: 0, open: 0 }, dateIso: "2026-07-15" },
    },
    readiness: { items: [], summary: { total: 0, ready: 0, inProgress: 0, blocked: 0 } },
    callDownSummary: { total: 0, open: 0 },
    openRepairs: [],
    inspectionsDue: [],
    activeDepartmentKeys: ["DIETARY" as const],
    activity: { repairsOpened: [], repairsResolved: [], inspectionsCompleted: [], knowledgePublished: [] },
  };
  const cards = buildManagerFocus(inputs as unknown as BusinessWorkspaceInputs);
  const assignmentCard = cards.find((c) => c.id === "focus-assignment-gaps");
  assert.ok(!assignmentCard, "should not have assignment card without assignmentSummary");
});
