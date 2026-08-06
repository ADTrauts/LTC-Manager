import assert from "node:assert/strict";
import test from "node:test";

import {
  decideEvidenceAuthority,
  requireEvidenceCorrect,
  requireEvidenceManage,
  requireEvidencePublish,
  requireEvidenceSubmit,
} from "./evidence-authority";

test("flag off denies all evidence authority", () => {
  const d = decideEvidenceAuthority({
    flagEnabled: false,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canSubmit, false);
  assert.equal(d.canManage, false);
  assert.equal(d.canPublish, false);
  assert.equal(d.canViewLogBook, false);
  assert.match(d.reason ?? "", /not enabled/i);
});

test("cross-facility access is denied", () => {
  const d = decideEvidenceAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f2",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canSubmit, false);
  assert.match(d.reason ?? "", /Cross-facility/i);
});

test("STAFF may submit and view own only", () => {
  const d = decideEvidenceAuthority({
    flagEnabled: true,
    role: "STAFF",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: null,
  });
  assert.equal(d.canSubmit, true);
  assert.equal(d.canViewOwn, true);
  assert.equal(d.canViewDepartment, false);
  assert.equal(d.canViewLogBook, false);
  assert.equal(d.canCorrect, false);
  assert.equal(d.canManage, false);
  assert.equal(d.canPublish, false);
  assert.doesNotThrow(() => requireEvidenceSubmit(d));
});

test("LEAD_TEAM_MEMBER may submit but not manage or Log Book department-wide", () => {
  const d = decideEvidenceAuthority({
    flagEnabled: true,
    role: "LEAD_TEAM_MEMBER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: null,
  });
  assert.equal(d.canSubmit, true);
  assert.equal(d.canViewOwn, true);
  assert.equal(d.canViewLogBook, false);
  assert.equal(d.canManage, false);
  assert.equal(d.canPublish, false);
});

test("SUPERVISOR may view Log Book and correct but not manage/publish", () => {
  const d = decideEvidenceAuthority({
    flagEnabled: true,
    role: "SUPERVISOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canSubmit, true);
  assert.equal(d.canViewDepartment, true);
  assert.equal(d.canViewLogBook, true);
  assert.equal(d.canCorrect, true);
  assert.equal(d.canManage, false);
  assert.equal(d.canPublish, false);
  assert.doesNotThrow(() => requireEvidenceCorrect(d));
  assert.throws(() => requireEvidenceManage(d));
});

test("MANAGER may manage and publish", () => {
  const d = decideEvidenceAuthority({
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
  assert.equal(d.canViewLogBook, true);
  assert.equal(d.canCorrect, true);
  assert.doesNotThrow(() => requireEvidenceManage(d));
  assert.doesNotThrow(() => requireEvidencePublish(d));
});

test("GM may manage and publish", () => {
  const d = decideEvidenceAuthority({
    flagEnabled: true,
    role: "GM",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canManage, true);
  assert.equal(d.canPublish, true);
});

test("FA without primaryDepartmentId match is denied", () => {
  const d = decideEvidenceAuthority({
    flagEnabled: true,
    role: "FACILITY_ADMINISTRATOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "dietary",
    departmentExists: true,
    primaryDepartmentId: "other",
  });
  assert.equal(d.canSubmit, false);
  assert.equal(d.canManage, false);
  assert.match(d.reason ?? "", /Facility Administrator/);
  assert.throws(() => requireEvidenceManage(d), /Facility Administrator/);
});

test("FA with primaryDepartmentId match may manage", () => {
  const d = decideEvidenceAuthority({
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
  assert.equal(d.canSubmit, true);
});

test("Quick PIN may submit but never grants Build", () => {
  const d = decideEvidenceAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "QUICK_PIN",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canSubmit, true);
  assert.equal(d.canViewLogBook, true);
  assert.equal(d.canCorrect, true);
  assert.equal(d.canManage, false);
  assert.equal(d.canPublish, false);
  assert.match(d.reason ?? "", /Quick PIN/i);
});

test("department missing denies", () => {
  const d = decideEvidenceAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "missing",
    departmentExists: false,
    primaryDepartmentId: "missing",
  });
  assert.equal(d.canSubmit, false);
  assert.match(d.reason ?? "", /Department not found/i);
});
