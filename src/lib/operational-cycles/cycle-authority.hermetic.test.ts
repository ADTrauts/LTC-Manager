import assert from "node:assert/strict";
import test from "node:test";

import {
  decideCycleAuthority,
  requireCycleManage,
  requireCyclePublish,
} from "./cycle-authority";

test("flag off denies all cycle authority", () => {
  const d = decideCycleAuthority({
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
  assert.equal(d.canViewDepartment, false);
  assert.equal(d.canManage, false);
  assert.equal(d.canPublish, false);
  assert.match(d.reason ?? "", /not enabled/i);
});

test("cross-facility access is denied", () => {
  const d = decideCycleAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f2",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canManage, false);
  assert.match(d.reason ?? "", /Cross-facility/i);
});

test("STAFF may view runtime only", () => {
  const d = decideCycleAuthority({
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
  assert.equal(d.canViewDepartment, false);
  assert.equal(d.canManage, false);
  assert.equal(d.canPublish, false);
});

test("SUPERVISOR may view department but not manage", () => {
  const d = decideCycleAuthority({
    flagEnabled: true,
    role: "SUPERVISOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canViewRuntime, true);
  assert.equal(d.canViewDepartment, true);
  assert.equal(d.canManage, false);
  assert.equal(d.canPublish, false);
});

test("MANAGER may manage and publish", () => {
  const d = decideCycleAuthority({
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
  assert.doesNotThrow(() => requireCycleManage(d));
  assert.doesNotThrow(() => requireCyclePublish(d));
});

test("FA without primaryDepartmentId match is denied", () => {
  const d = decideCycleAuthority({
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
  assert.equal(d.canViewDepartment, false);
  assert.match(d.reason ?? "", /Facility Administrator/);
  assert.throws(() => requireCycleManage(d), /Facility Administrator/);
});

test("FA with primaryDepartmentId match may manage", () => {
  const d = decideCycleAuthority({
    flagEnabled: true,
    role: "FACILITY_ADMINISTRATOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "dietary",
    departmentExists: true,
    primaryDepartmentId: "dietary",
  });
  assert.equal(d.canManage, true);
  assert.equal(d.canPublish, true);
});

test("Quick PIN does not grant Build access for Manager", () => {
  const d = decideCycleAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "QUICK_PIN",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canViewRuntime, true);
  assert.equal(d.canViewDepartment, true);
  assert.equal(d.canManage, false);
  assert.equal(d.canPublish, false);
  assert.match(d.reason ?? "", /Quick PIN/i);
});
