import assert from "node:assert/strict";
import test from "node:test";

import { decideWorkAuthority } from "./authority";

test("flag off denies all Work authority", () => {
  const d = decideWorkAuthority({
    flagEnabled: false,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canViewRuntime, false);
  assert.equal(d.canManage, false);
  assert.equal(d.canPublish, false);
});

test("cross-facility denied", () => {
  const d = decideWorkAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f2",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canComplete, false);
  assert.match(d.reason ?? "", /Cross-facility/);
});

test("FA without dietary primary department denied", () => {
  const d = decideWorkAuthority({
    flagEnabled: true,
    role: "FACILITY_ADMINISTRATOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "dietary",
    departmentExists: true,
    primaryDepartmentId: "other",
  });
  assert.equal(d.canManage, false);
  assert.match(d.reason ?? "", /Facility Administrator/);
});

test("staff can complete runtime Work but not manage", () => {
  const d = decideWorkAuthority({
    flagEnabled: true,
    role: "STAFF",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: null,
  });
  assert.equal(d.canViewRuntime, true);
  assert.equal(d.canComplete, true);
  assert.equal(d.canManage, false);
  assert.equal(d.canPublish, false);
  assert.equal(d.canCreateOneOff, false);
});

test("Quick PIN blocks Builder and supervisor management", () => {
  const d = decideWorkAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "QUICK_PIN",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canComplete, true);
  assert.equal(d.canManage, false);
  assert.equal(d.canPublish, false);
  assert.equal(d.canCreateOneOff, false);
  assert.equal(d.canReassign, false);
});

test("supervisor password can one-off reassign not-required reopen", () => {
  const d = decideWorkAuthority({
    flagEnabled: true,
    role: "SUPERVISOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: null,
  });
  assert.equal(d.canCreateOneOff, true);
  assert.equal(d.canReassign, true);
  assert.equal(d.canMarkNotRequired, true);
  assert.equal(d.canReopen, true);
  assert.equal(d.canManage, false);
  assert.equal(d.canPublish, false);
});

test("manager password can manage and publish", () => {
  const d = decideWorkAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canManage, true);
  assert.equal(d.canPublish, true);
  assert.equal(d.canCreateOneOff, true);
});
