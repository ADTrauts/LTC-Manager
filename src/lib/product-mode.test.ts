import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_MODES,
  groupNavItemsByMode,
  resolveActiveMode,
  resolveProductAreaLabel,
  resolveProductModeForPath,
} from "@/lib/product-mode";

test("product-mode — operational surfaces resolve to RUN", () => {
  for (const path of [
    "/workspace",
    "/today",
    "/today/coverage",
    "/units",
    "/unit/abc",
    "/staffing",
    "/staffing/assignments",
    "/staffing/log-book",
    "/staffing/log-book/rec-1",
    "/logs",
    "/assets",
    "/assets/asset-1",
    "/repairs",
    "/reports",
  ]) {
    assert.equal(resolveProductModeForPath(path), "RUN", path);
  }
});

test("product-mode — configuration surfaces resolve to BUILD", () => {
  for (const path of [
    "/build",
    "/admin/facility/builder",
    "/admin/departments",
    "/admin/departments/dept-1",
    "/admin/knowledge",
    "/employees",
    "/employees/import",
    "/menus",
    "/staffing/templates",
    "/staffing/work-plans",
    "/staffing/work-plans/wp-1",
  ]) {
    assert.equal(resolveProductModeForPath(path), "BUILD", path);
  }
});

test("product-mode — governance surfaces resolve to ADMIN", () => {
  for (const path of ["/admin", "/admin/organization", "/admin/organization/facilities", "/admin/permissions", "/account"]) {
    assert.equal(resolveProductModeForPath(path), "ADMIN", path);
  }
});

test("product-mode — longest-prefix wins so BUILD tools override the RUN /staffing default", () => {
  assert.equal(resolveProductModeForPath("/staffing"), "RUN");
  assert.equal(resolveProductModeForPath("/staffing/templates"), "BUILD");
  assert.equal(resolveProductModeForPath("/staffing/work-plans"), "BUILD");
  // and BUILD tools override the ADMIN /admin default
  assert.equal(resolveProductModeForPath("/admin"), "ADMIN");
  assert.equal(resolveProductModeForPath("/admin/departments"), "BUILD");
});

test("product-mode — unknown paths default to RUN (never hides a surface behind a mode)", () => {
  assert.equal(resolveProductModeForPath("/totally-unknown"), "RUN");
  assert.equal(resolveProductModeForPath("/"), "RUN");
});

test("product-mode — area label is available for the mode indicator", () => {
  assert.equal(resolveProductAreaLabel("/units"), "Locations");
  assert.equal(resolveProductAreaLabel("/build"), "Build Home");
  assert.equal(resolveProductAreaLabel("/admin/departments"), "Department Builder");
  assert.equal(resolveProductAreaLabel("/staffing/log-book"), "Log Book");
});

test("groupNavItemsByMode — groups in RUN → BUILD → ADMIN order and preserves item order", () => {
  const groups = groupNavItemsByMode([
    { label: "Dashboard", href: "/workspace" },
    { label: "Department Builder", href: "/admin/departments" },
    { label: "Locations", href: "/units" },
    { label: "Admin", href: "/admin" },
    { label: "Facility Builder", href: "/admin/facility/builder" },
  ]);
  assert.deepEqual(
    groups.map((g) => g.mode),
    ["RUN", "BUILD", "ADMIN"],
  );
  assert.deepEqual(
    groups[0]?.items.map((i) => i.href),
    ["/workspace", "/units"],
  );
  assert.deepEqual(
    groups[1]?.items.map((i) => i.href),
    ["/admin/departments", "/admin/facility/builder"],
  );
});

test("groupNavItemsByMode — omits empty modes (frontline RUN-only)", () => {
  const groups = groupNavItemsByMode([
    { label: "Logs", href: "/logs" },
    { label: "Repairs", href: "/repairs" },
  ]);
  assert.deepEqual(
    groups.map((g) => g.mode),
    ["RUN"],
  );
});

test("resolveActiveMode — active mode follows the path, falling back to an available mode", () => {
  const runOnly = groupNavItemsByMode([{ label: "Logs", href: "/logs" }]);
  // A RUN-only user landing on an admin deep link they can't navigate to falls back to RUN.
  assert.equal(resolveActiveMode("/admin", runOnly), "RUN");
  const full = groupNavItemsByMode([
    { label: "Dashboard", href: "/workspace" },
    { label: "Department Builder", href: "/admin/departments" },
    { label: "Admin", href: "/admin" },
  ]);
  assert.equal(resolveActiveMode("/admin/departments", full), "BUILD");
  assert.equal(resolveActiveMode("/workspace", full), "RUN");
  assert.equal(resolveActiveMode("/admin", full), "ADMIN");
});

test("product-mode — exactly three modes are defined", () => {
  assert.deepEqual([...PRODUCT_MODES], ["RUN", "BUILD", "ADMIN"]);
});
