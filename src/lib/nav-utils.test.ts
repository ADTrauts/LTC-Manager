import assert from "node:assert/strict";
import test from "node:test";

import { isActiveNavPath } from "@/lib/nav-utils";

test("isActiveNavPath matches exact href", () => {
  assert.equal(isActiveNavPath("/dashboard", "/dashboard"), true);
  assert.equal(isActiveNavPath("/staffing", "/dashboard"), false);
});

test("isActiveNavPath matches nested paths", () => {
  assert.equal(isActiveNavPath("/unit/abc/logs", "/unit/abc"), true);
  assert.equal(isActiveNavPath("/admin/organization", "/admin"), true);
});

test("isActiveNavPath limits employees highlight to known HR subpaths", () => {
  assert.equal(isActiveNavPath("/employees", "/employees"), true);
  assert.equal(isActiveNavPath("/employees/import", "/employees"), true);
  assert.equal(isActiveNavPath("/employees/unknown-tab", "/employees"), false);
});

test("isActiveNavPath returns false when pathname is null", () => {
  assert.equal(isActiveNavPath(null, "/dashboard"), false);
});
