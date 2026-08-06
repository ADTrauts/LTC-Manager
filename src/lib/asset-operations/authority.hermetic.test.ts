import assert from "node:assert/strict";
import test from "node:test";

import {
  decideAssetOperationsAuthority,
  requireAssetManage,
  requireAssetReport,
  requireAssetStatusChange,
  requireWorkOrderManage,
} from "./authority";

test("flag off denies all Asset Operations authority", () => {
  const d = decideAssetOperationsAuthority({
    flagEnabled: false,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    departmentKey: "DIETARY",
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canViewRuntime, false);
  assert.equal(d.canReportIssue, false);
  assert.equal(d.canManageAssets, false);
  assert.equal(d.canManageWorkOrders, false);
  assert.match(d.reason ?? "", /not enabled/i);
});

test("cross-facility access is denied", () => {
  const d = decideAssetOperationsAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f2",
    departmentId: "d1",
    departmentExists: true,
    departmentKey: "DIETARY",
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canReportIssue, false);
  assert.equal(d.canManageWorkOrders, false);
  assert.match(d.reason ?? "", /Cross-facility/i);
});

test("STAFF may report and view runtime but not triage or manage", () => {
  const d = decideAssetOperationsAuthority({
    flagEnabled: true,
    role: "STAFF",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    departmentKey: "DIETARY",
    primaryDepartmentId: null,
  });
  assert.equal(d.canViewRuntime, true);
  assert.equal(d.canReportIssue, true);
  assert.equal(d.canTriageIssue, false);
  assert.equal(d.canManageWorkOrders, false);
  assert.equal(d.canManageAssets, false);
  assert.equal(d.canChangeAssetStatus, false);
  assert.equal(d.canAssignVendor, false);
  assert.doesNotThrow(() => requireAssetReport(d));
  assert.throws(() => requireWorkOrderManage(d));
});

test("SUPERVISOR may triage and manage Work Orders but not Asset Builder", () => {
  const d = decideAssetOperationsAuthority({
    flagEnabled: true,
    role: "SUPERVISOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    departmentKey: "DIETARY",
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canTriageIssue, true);
  assert.equal(d.canManageWorkOrders, true);
  assert.equal(d.canChangeAssetStatus, true);
  assert.equal(d.canManageAssets, false);
  assert.equal(d.canAssignVendor, false);
  assert.equal(d.canViewManagementNotes, true);
  assert.throws(() => requireAssetManage(d));
});

test("MANAGER may manage Assets, Vendors, and Work Orders", () => {
  const d = decideAssetOperationsAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    departmentKey: "DIETARY",
    primaryDepartmentId: "d1",
  });
  assert.equal(d.canManageAssets, true);
  assert.equal(d.canManageWorkOrders, true);
  assert.equal(d.canAssignVendor, true);
  assert.equal(d.canChangeAssetStatus, true);
  assert.equal(d.canViewVendorDetails, true);
  assert.doesNotThrow(() => requireAssetManage(d));
  assert.doesNotThrow(() => requireAssetStatusChange(d));
});

test("FA alone without primaryDepartment match is denied", () => {
  const d = decideAssetOperationsAuthority({
    flagEnabled: true,
    role: "FACILITY_ADMINISTRATOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "dietary",
    departmentExists: true,
    departmentKey: "DIETARY",
    primaryDepartmentId: "other",
  });
  assert.equal(d.canReportIssue, false);
  assert.equal(d.canManageAssets, false);
  assert.match(d.reason ?? "", /Facility Administrator/);
  assert.throws(() => requireAssetManage(d), /Facility Administrator/);
});

test("FA with primaryDepartment match may manage Assets", () => {
  const d = decideAssetOperationsAuthority({
    flagEnabled: true,
    role: "FACILITY_ADMINISTRATOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "dietary",
    departmentExists: true,
    departmentKey: "DIETARY",
    primaryDepartmentId: "dietary",
  });
  assert.equal(d.canManageAssets, true);
  assert.equal(d.canManageWorkOrders, true);
  assert.equal(d.canAssignVendor, true);
});

test("Quick PIN never grants Asset Builder or Work Order manage", () => {
  const managerPin = decideAssetOperationsAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "QUICK_PIN",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    departmentKey: "DIETARY",
    primaryDepartmentId: "d1",
  });
  assert.equal(managerPin.canReportIssue, true);
  assert.equal(managerPin.canTriageIssue, true);
  assert.equal(managerPin.canManageWorkOrders, false);
  assert.equal(managerPin.canManageAssets, false);
  assert.equal(managerPin.canAssignVendor, false);
  assert.equal(managerPin.canChangeAssetStatus, false);
  assert.equal(managerPin.canViewManagementNotes, true);
  assert.throws(() => requireWorkOrderManage(managerPin));

  const supervisorPin = decideAssetOperationsAuthority({
    flagEnabled: true,
    role: "SUPERVISOR",
    authMethod: "QUICK_PIN",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    departmentKey: "DIETARY",
    primaryDepartmentId: "d1",
  });
  assert.equal(supervisorPin.canTriageIssue, true);
  assert.equal(supervisorPin.canManageWorkOrders, false);
  assert.equal(supervisorPin.canChangeAssetStatus, false);
});

test("department missing denies", () => {
  const d = decideAssetOperationsAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "missing",
    departmentExists: false,
    departmentKey: null,
    primaryDepartmentId: "missing",
  });
  assert.equal(d.canViewRuntime, false);
  assert.match(d.reason ?? "", /Department not found/i);
});
