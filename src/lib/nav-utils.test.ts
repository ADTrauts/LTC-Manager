import assert from "node:assert/strict";
import test from "node:test";

import { isActiveLocationHref, isActiveNavPath } from "@/lib/nav-utils";

test("isActiveNavPath matches exact href", () => {
  assert.equal(isActiveNavPath("/dashboard", "/dashboard"), true);
  assert.equal(isActiveNavPath("/staffing", "/dashboard"), false);
});

test("isActiveNavPath matches nested paths", () => {
  assert.equal(isActiveNavPath("/unit/abc/logs", "/unit/abc"), true);
  assert.equal(isActiveNavPath("/admin/organization", "/admin"), true);
  assert.equal(isActiveNavPath("/admin/departments/cldept1", "/admin/departments"), true);
  assert.equal(
    isActiveNavPath("/admin/departments/cldept1", "/admin/departments/cldept1"),
    true,
  );
});

test("isActiveNavPath limits employees highlight to known HR subpaths", () => {
  assert.equal(isActiveNavPath("/employees", "/employees"), true);
  assert.equal(isActiveNavPath("/employees/import", "/employees"), true);
  assert.equal(isActiveNavPath("/employees/unknown-tab", "/employees"), false);
});

test("isActiveNavPath returns false when pathname is null", () => {
  assert.equal(isActiveNavPath(null, "/dashboard"), false);
});

test("isActiveLocationHref distinguishes Room ?space= from parent Neighborhood", () => {
  const unit = "/unit/neighborhood-1a";
  const room = `${unit}?space=naval-park-servery`;
  assert.equal(isActiveLocationHref(unit, "space=naval-park-servery", room), true);
  assert.equal(isActiveLocationHref(unit, "space=naval-park-servery", unit), false);
  assert.equal(isActiveLocationHref(unit, "", unit), true);
  assert.equal(isActiveLocationHref(unit, "", room), false);
  assert.equal(
    isActiveLocationHref(unit, "space=naval-park-servery", `${unit}?space=other-room`),
    false,
  );
});
