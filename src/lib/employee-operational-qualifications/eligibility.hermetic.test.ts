import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getRoleDefinition, isRoleValidForDepartment } from "@/lib/scheduling/assignment-roles";
import { suggestEmployeeForPosition } from "@/lib/scheduling/operational-assignments/build-assignment-suggestions";

import {
  activeRoleKeys,
  assertQualificationSelection,
  decideOperationalStaffing,
  planQualificationWrites,
} from "./eligibility";

test("one employee can hold several operational roles", () => {
  const keys = assertQualificationSelection({
    isDepartmentMember: true,
    departmentKey: "DIETARY",
    roleKeys: ["SERVER", "COOK", "SERVER"],
  });
  assert.deepEqual(keys, ["SERVER", "COOK"]);
  const plan = planQualificationWrites({ existing: [], desiredRoleKeys: keys });
  assert.deepEqual(plan.create, ["SERVER", "COOK"]);
});

test("two departments keep separate eligibility", () => {
  const dietary = assertQualificationSelection({
    isDepartmentMember: true,
    departmentKey: "DIETARY",
    roleKeys: ["SERVER"],
  });
  const evs = assertQualificationSelection({
    isDepartmentMember: true,
    departmentKey: "EVS",
    roleKeys: ["CLEANING_ROUND"],
  });
  assert.equal(isRoleValidForDepartment(dietary[0]!, "EVS"), false);
  assert.equal(isRoleValidForDepartment(evs[0]!, "DIETARY"), false);
});

test("department membership is required and is not itself a qualification", () => {
  assert.throws(
    () =>
      assertQualificationSelection({
        isDepartmentMember: false,
        departmentKey: "DIETARY",
        roleKeys: ["SERVER"],
      }),
    /Department membership/,
  );
  assert.deepEqual(activeRoleKeys([]), []);
});

test("job title, team, and platform role are not eligibility inputs", () => {
  const source = readFileSync(new URL("./eligibility.ts", import.meta.url), "utf8");
  assert.equal(source.includes("jobTitle"), false);
  assert.equal(source.includes("teamId"), false);
  assert.equal(source.includes("roleType"), false);
  assert.equal(source.includes("DepartmentJobRole"), false);
  assert.equal(source.includes("ScheduleEntry"), false);
});

test("revoking eligibility does not describe an assignment rewrite", () => {
  const plan = planQualificationWrites({
    existing: [
      { roleKey: "SERVER", status: "ACTIVE" },
      { roleKey: "COOK", status: "REVOKED" },
    ],
    desiredRoleKeys: ["COOK"],
  });
  assert.deepEqual(plan, { create: [], activate: ["COOK"], revoke: ["SERVER"] });
});

test("template suggestions skip an employee who is not eligible for the role", () => {
  const person = {
    id: "ada",
    firstName: "Ada",
    lastName: "Lane",
    departmentKey: "DIETARY",
    departmentName: "Dietary",
    scheduledShift: null,
    plannedStart: null,
    plannedEnd: null,
    unitName: null,
    hasCallDown: false,
    callDownReason: null,
  };
  const blocked = suggestEmployeeForPosition({
    roleKey: "SERVER",
    unitId: null,
    scheduledEmployees: [person],
    existingAssignments: [],
    alreadySuggestedIds: new Set(),
    eligibleEmployeeIds: new Set(),
  });
  assert.equal(blocked, null);
  const allowed = suggestEmployeeForPosition({
    roleKey: "SERVER",
    unitId: null,
    scheduledEmployees: [person],
    existingAssignments: [],
    alreadySuggestedIds: new Set(),
    eligibleEmployeeIds: new Set(["ada"]),
  });
  assert.equal(allowed?.employeeId, "ada");
});

test("an unqualified employee is not treated as qualified", () => {
  const denied = decideOperationalStaffing({
    qualified: false,
    exceptionReason: "   ",
    canOverride: true,
  });
  assert.equal(denied.allow, false);
});

test("an authorized exception is explicit and does not grant eligibility", () => {
  const allowed = decideOperationalStaffing({
    qualified: false,
    exceptionReason: "Only closer on the floor",
    canOverride: true,
  });
  assert.equal(allowed.allow, true);
  if (allowed.allow) assert.equal(allowed.recordExceptionReason, "Only closer on the floor");
  const qualified = decideOperationalStaffing({
    qualified: true,
    exceptionReason: "not needed",
    canOverride: true,
  });
  assert.equal(qualified.allow, true);
  if (qualified.allow) assert.equal(qualified.recordExceptionReason, null);
});

test("someone without assignment authority cannot record an exception", () => {
  const denied = decideOperationalStaffing({
    qualified: false,
    exceptionReason: "Cover the line",
    canOverride: false,
  });
  assert.equal(denied.allow, false);
});

test("retail functions are registry roles and lead server is not", () => {
  assert.equal(getRoleDefinition("CASHIER")?.departmentKeys[0], "DIETARY");
  assert.equal(getRoleDefinition("BARISTA")?.label, "Barista");
  assert.equal(getRoleDefinition("LEAD_SERVER"), undefined);
  assert.equal(getRoleDefinition("PREP_COOK"), undefined);
  assert.ok(getRoleDefinition("HOT_PREP"));
  assert.ok(getRoleDefinition("COLD_PREP"));
});

test("qualification changes do not grant platform authority", () => {
  const action = readFileSync(
    new URL("../../app/(protected)/employees/qualification-actions.ts", import.meta.url),
    "utf8",
  );
  const replace = readFileSync(new URL("./replace.ts", import.meta.url), "utf8");
  assert.match(action, /requireAtLeastRole\(session\.role, "MANAGER"\)/);
  assert.match(action, /assertCanChangeDepartmentPeople/);
  assert.equal(replace.includes("roleType"), false);
  assert.equal(replace.includes("headEmployeeId"), false);
  assert.equal(replace.includes("teamMembership"), false);
});

test("new assignments snapshot the registry label and do not derive a job role", () => {
  const action = readFileSync(
    new URL("../../app/(protected)/staffing/assignments/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(action, /const roleLabel = roleDef\.label/);
  assert.equal(action.includes("deriveDefaultRoleKeyForDepartmentJobRole"), false);
  assert.equal(action.includes("operationalAssignmentEligibilityException.upsert"), false);
  assert.match(action, /operationalAssignmentEligibilityException\.create/);
  assert.equal(action.includes("deriveRoleLabelSnapshot"), false);
  assert.equal(action.includes("teamMembership"), false);
});

test("coverage and assignment share the registry key", () => {
  const coverage = readFileSync(
    new URL("../scheduling/coverage-expectations/match-expectation.ts", import.meta.url),
    "utf8",
  );
  const assignment = readFileSync(
    new URL("../scheduling/operational-assignments/validate-operational-assignment.ts", import.meta.url),
    "utf8",
  );
  assert.match(coverage, /roleKey/);
  assert.equal(coverage.includes("EmployeeOperationalRoleQualification"), false);
  assert.equal(coverage.includes("teamId"), false);
  assert.match(assignment, /isRoleValidForDepartment/);
});
