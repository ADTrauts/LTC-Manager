import assert from "node:assert/strict";
import test from "node:test";

import { requireAssignmentManage, type AssignmentAuthorityDecision } from "./assignment-authority";

test("STAFF authority decision cannot manage Assignments", () => {
  const staff: AssignmentAuthorityDecision = {
    canViewOwn: true,
    canViewDepartment: false,
    canManage: false,
    canConfirm: false,
    canReopen: false,
    canOverride: false,
    reason: null,
  };
  assert.throws(() => requireAssignmentManage(staff), /Insufficient|authority/i);
});

test("SUPERVISOR authority decision can manage Assignments", () => {
  const supervisor: AssignmentAuthorityDecision = {
    canViewOwn: true,
    canViewDepartment: true,
    canManage: true,
    canConfirm: true,
    canReopen: true,
    canOverride: true,
    reason: null,
  };
  assert.doesNotThrow(() => requireAssignmentManage(supervisor));
});

test("Facility Administrator denial reason is explicit when manage is false", () => {
  const fa: AssignmentAuthorityDecision = {
    canViewOwn: true,
    canViewDepartment: false,
    canManage: false,
    canConfirm: false,
    canReopen: false,
    canOverride: false,
    reason:
      "Facility Administrator status alone does not grant Dietary Assignment authority.",
  };
  assert.throws(() => requireAssignmentManage(fa), /Facility Administrator/);
});
