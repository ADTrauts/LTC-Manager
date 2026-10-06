import assert from "node:assert/strict";
import test from "node:test";

import { resolveMembershipPrimaryOperationalDepartmentId } from "@/lib/active-department-scope";

test("selectable customer department wins over a DEVELOPMENT primary", () => {
  assert.equal(
    resolveMembershipPrimaryOperationalDepartmentId({
      selectableDepartmentId: "dietary-1",
      sessionPrimaryDepartmentId: "plant-1",
      employeePrimaryDepartmentId: "plant-1",
      memberDepartmentIds: ["dietary-1", "plant-1"],
    }),
    "dietary-1",
  );
});

test("Plant-primary members keep Plant operational scope when Plant is not selectable", () => {
  assert.equal(
    resolveMembershipPrimaryOperationalDepartmentId({
      selectableDepartmentId: null,
      sessionPrimaryDepartmentId: "plant-1",
      employeePrimaryDepartmentId: "plant-1",
      memberDepartmentIds: ["plant-1"],
    }),
    "plant-1",
  );
});

test("membership primary is ignored when the actor does not belong to it", () => {
  assert.equal(
    resolveMembershipPrimaryOperationalDepartmentId({
      selectableDepartmentId: null,
      sessionPrimaryDepartmentId: "plant-1",
      employeePrimaryDepartmentId: "plant-1",
      memberDepartmentIds: ["dietary-1"],
    }),
    null,
  );
});
