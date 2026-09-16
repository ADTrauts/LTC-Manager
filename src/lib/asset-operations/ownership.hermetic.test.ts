import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSET_BUILD_PATH,
  ASSET_RUN_PATH,
  assetResponsibleDepartmentWhere,
  isAssetLifecycleRetired,
  isAssetOperationalCondition,
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
  assert.equal(isAssetOperationalCondition("OPERATIONAL"), true);
  assert.equal(isAssetOperationalCondition("DEGRADED"), true);
  assert.equal(isAssetOperationalCondition("OUT_OF_SERVICE"), true);
  assert.equal(isAssetOperationalCondition("RETIRED"), false);
  assert.equal(isAssetOperationalCondition("ACTIVE"), false);
});
