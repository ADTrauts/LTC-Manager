import assert from "node:assert/strict";
import test from "node:test";

import { overrideDepartmentProductStatusForTest } from "@/lib/department-products/registry";
import { getLandingDepartments } from "./landing-departments";

test("a department profile appears only while the product is customer-visible", t => {
  t.after(() => overrideDepartmentProductStatusForTest("EVS", null));

  overrideDepartmentProductStatusForTest("EVS", "DEVELOPMENT");
  assert.ok(!getLandingDepartments().some(department => department.id === "evs"));

  overrideDepartmentProductStatusForTest("EVS", "AVAILABLE");
  assert.equal(getLandingDepartments().find(department => department.id === "evs")?.name, "Environmental Services");
});
