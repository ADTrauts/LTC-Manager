import assert from "node:assert/strict";
import test from "node:test";

import { DEPARTMENT_NONE_REASON, DEPARTMENT_VIEW_REASON, type DepartmentAccess } from "./access";
import { applyDepartmentChangeCeiling } from "./changes";

function access(mode: DepartmentAccess["mode"]): DepartmentAccess {
  return {
    departmentId: "dept",
    mode,
    canReadComplianceRecords: mode === "MANAGE" || mode === "VIEW",
    operatingModel: "FACILITY_OPERATED",
    operatorName: null,
    operatorPeriodId: null,
    vendorHeadAccepted: false,
    isMember: mode === "MANAGE",
    isHead: false,
    reason: mode === "VIEW" ? DEPARTMENT_VIEW_REASON : mode === "NONE" ? DEPARTMENT_NONE_REASON : null,
  };
}

const decision = {
  canView: true,
  canManage: true,
  reason: null as string | null,
};

test("change ceiling leaves the role decision alone when enforcement is off or the mode is MANAGE", () => {
  const spec = { writes: ["canManage"] as const, views: ["canView"] as const };
  assert.deepEqual(applyDepartmentChangeCeiling(decision, null, spec), decision);
  assert.deepEqual(applyDepartmentChangeCeiling(decision, access("MANAGE"), spec), decision);
});

test("change ceiling keeps a view and clears a write", () => {
  const next = applyDepartmentChangeCeiling(decision, access("VIEW"), {
    writes: ["canManage"],
    views: ["canView"],
  });
  assert.equal(next.canView, true);
  assert.equal(next.canManage, false);
  assert.equal(next.reason, DEPARTMENT_VIEW_REASON);
});

test("change ceiling clears a view when the person is outside the Department", () => {
  const next = applyDepartmentChangeCeiling(decision, access("NONE"), {
    writes: ["canManage"],
    views: ["canView"],
  });
  assert.equal(next.canView, false);
  assert.equal(next.canManage, false);
  assert.equal(next.reason, DEPARTMENT_NONE_REASON);
});

test("change ceiling keeps a role reason when that role already could not write", () => {
  const next = applyDepartmentChangeCeiling(
    { canView: true, canManage: false, reason: "Quick PIN does not grant Build access." },
    access("VIEW"),
    { writes: ["canManage"], views: ["canView"] },
  );
  assert.equal(next.canManage, false);
  assert.equal(next.reason, "Quick PIN does not grant Build access.");
});
