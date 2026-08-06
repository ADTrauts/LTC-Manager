import assert from "node:assert/strict";
import test from "node:test";

import {
  decideJobFlowAuthority,
  requireSupervisorBoard,
} from "./job-flow-authority";

test("flag off denies Job Flow and Supervisor Board", () => {
  const d = decideJobFlowAuthority({
    flagEnabled: false,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canViewOwnJobFlow, false);
  assert.equal(d.canViewSupervisorBoard, false);
  assert.match(d.reason ?? "", /not enabled/i);
});

test("cross-facility access is denied", () => {
  const d = decideJobFlowAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f2",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canViewOwnJobFlow, false);
  assert.equal(d.canViewSupervisorBoard, false);
  assert.match(d.reason ?? "", /Cross-facility/i);
});

test("STAFF may view own Job Flow only", () => {
  const d = decideJobFlowAuthority({
    flagEnabled: true,
    role: "STAFF",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: null,
  });
  assert.equal(d.canViewOwnJobFlow, true);
  assert.equal(d.canViewSupervisorBoard, false);
  assert.throws(() => requireSupervisorBoard(d));
});

test("LEAD_TEAM_MEMBER may view own Job Flow only", () => {
  const d = decideJobFlowAuthority({
    flagEnabled: true,
    role: "LEAD_TEAM_MEMBER",
    authMethod: "QUICK_PIN",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: null,
  });
  assert.equal(d.canViewOwnJobFlow, true);
  assert.equal(d.canViewSupervisorBoard, false);
});

test("SUPERVISOR may view Supervisor Board", () => {
  const d = decideJobFlowAuthority({
    flagEnabled: true,
    role: "SUPERVISOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canViewOwnJobFlow, true);
  assert.equal(d.canViewSupervisorBoard, true);
  assert.doesNotThrow(() => requireSupervisorBoard(d));
});

test("FA without primaryDepartmentId match is denied", () => {
  const d = decideJobFlowAuthority({
    flagEnabled: true,
    role: "FACILITY_ADMINISTRATOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "dietary",
    departmentExists: true,
    primaryDepartmentId: "other",
  });
  assert.equal(d.canViewOwnJobFlow, false);
  assert.equal(d.canViewSupervisorBoard, false);
  assert.match(d.reason ?? "", /Facility Administrator/);
});

test("FA with primaryDepartmentId match may view board", () => {
  const d = decideJobFlowAuthority({
    flagEnabled: true,
    role: "FACILITY_ADMINISTRATOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "dietary",
    departmentExists: true,
    primaryDepartmentId: "dietary",
  });
  assert.equal(d.canViewOwnJobFlow, true);
  assert.equal(d.canViewSupervisorBoard, true);
});

test("Quick PIN never grants Supervisor Board for Manager", () => {
  const d = decideJobFlowAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "QUICK_PIN",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canViewOwnJobFlow, true);
  assert.equal(d.canViewSupervisorBoard, false);
  assert.match(d.reason ?? "", /Quick PIN/i);
});
