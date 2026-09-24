import assert from "node:assert/strict";
import test from "node:test";

import {
  DEPARTMENT_ADMIN_TABS,
  departmentAdminHref,
} from "@/lib/department-administration";

test("departmentAdminHref preserves tab deep-links for SubNav items", () => {
  const overview = departmentAdminHref("dept-1", "overview", null);
  const cycles = departmentAdminHref("dept-1", "cycles", "prof-1");
  // Overview is the default tab — no query param.
  assert.equal(overview, "/admin/departments/dept-1");
  assert.match(cycles, /tab=cycles/);
  assert.match(cycles, /profile=prof-1/);
});

test("Department Builder primary tabs remain Overview Locations Teams Coverage Cycles", () => {
  const ids = DEPARTMENT_ADMIN_TABS.map((t) => t.id);
  assert.deepEqual(ids.slice(0, 5), ["overview", "locations", "teams", "coverage", "cycles"]);
});
