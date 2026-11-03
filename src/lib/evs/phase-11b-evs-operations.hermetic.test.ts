/**
 * EVS Job Flow authority stays on the shared Job Flow decision.
 * Generic Department Work is retired.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { isDepartmentJobFlowEnabled } from "@/lib/department-operations";
import { decideJobFlowAuthority } from "@/lib/dietary-job-flow/job-flow-authority";

test("EVS Job Flow stays on without a work-plan switch", () => {
  assert.equal(isDepartmentJobFlowEnabled("EVS"), true);
  assert.equal(isDepartmentJobFlowEnabled("DIETARY"), true);
  assert.equal(isDepartmentJobFlowEnabled(null), false);
});

test("decideJobFlowAuthority: EVS flag off denies; STAFF can view own Job Flow when enabled", () => {
  const denied = decideJobFlowAuthority({
    flagEnabled: false,
    role: "STAFF",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "evs",
    departmentExists: true,
    primaryDepartmentId: null,
  });
  assert.equal(denied.canViewOwnJobFlow, false);

  const staff = decideJobFlowAuthority({
    flagEnabled: true,
    role: "STAFF",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "evs",
    departmentExists: true,
    primaryDepartmentId: null,
  });
  assert.equal(staff.canViewOwnJobFlow, true);
  assert.equal(staff.canViewSupervisorBoard, false);
});
