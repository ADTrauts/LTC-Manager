import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSET_BUILD_PATH,
  ASSET_RUN_PATH,
  assetAttentionConditionWhere,
  assetAvailableForProspectiveUseWhere,
  assetNotRetiredWhere,
  assetResponsibleDepartmentWhere,
  isAssetLifecycleRetired,
  isAssetOperationalCondition,
  isAssetStatusHistoryLifecycleEvent,
  resolveAssetOwnershipSurface,
} from "./ownership";

test("BUILD path resolves to BUILD ownership surface", () => {
  assert.equal(resolveAssetOwnershipSurface(ASSET_BUILD_PATH), "BUILD");
  assert.equal(resolveAssetOwnershipSurface("/assets/builder?x=1"), "BUILD");
});

test("RUN assets paths resolve to RUN ownership surface", () => {
  assert.equal(resolveAssetOwnershipSurface(ASSET_RUN_PATH), "RUN");
  assert.equal(resolveAssetOwnershipSurface("/assets/clxxxxxxxxxxxxxxxxxxxxxxxx"), "RUN");
});

test("department filter is empty for All Departments", () => {
  assert.deepEqual(assetResponsibleDepartmentWhere(null), {});
  assert.deepEqual(assetResponsibleDepartmentWhere(undefined), {});
});

test("department filter includes responsible dept and unassigned", () => {
  const where = assetResponsibleDepartmentWhere("dept-1");
  assert.deepEqual(where, {
    OR: [{ departmentId: "dept-1" }, { departmentId: null }],
  });
});

test("lifecycle vs operational condition helpers", () => {
  assert.equal(isAssetLifecycleRetired("RETIRED"), true);
  assert.equal(isAssetLifecycleRetired("OPERATIONAL"), false);
  assert.equal(isAssetLifecycleRetired("ACTIVE"), false);
  assert.equal(isAssetOperationalCondition("OPERATIONAL"), true);
  assert.equal(isAssetOperationalCondition("DEGRADED"), true);
  assert.equal(isAssetOperationalCondition("OUT_OF_SERVICE"), true);
  assert.equal(isAssetOperationalCondition("RETIRED"), false);
  assert.equal(isAssetOperationalCondition("ACTIVE"), true);
});

test("assetNotRetiredWhere is the shared active-lifecycle filter", () => {
  assert.deepEqual(assetNotRetiredWhere(), { status: { not: "RETIRED" } });
  assert.deepEqual(assetAvailableForProspectiveUseWhere(), {
    status: { in: ["ACTIVE", "OPERATIONAL", "DEGRADED"] },
  });
  assert.deepEqual(assetAttentionConditionWhere(), {
    status: { in: ["DEGRADED", "OUT_OF_SERVICE"] },
  });
});

test("AssetStatusHistory retirement is a lifecycle event, not a condition change", () => {
  assert.equal(
    isAssetStatusHistoryLifecycleEvent({ toStatus: "RETIRED", reason: "RETIREMENT" }),
    true,
  );
  assert.equal(
    isAssetStatusHistoryLifecycleEvent({ toStatus: "OUT_OF_SERVICE", reason: "MANUAL" }),
    false,
  );
  assert.equal(
    isAssetStatusHistoryLifecycleEvent({ toStatus: "OPERATIONAL", reason: "RETURN_TO_SERVICE" }),
    false,
  );
});
