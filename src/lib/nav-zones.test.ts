import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardNavHref,
  groupNavItemsByZone,
  normalizePrimaryNavLabel,
  resolveDefaultHomePath,
  resolveZoneForPathname,
  resolveZoneForPathPrefix,
  shouldShowZoneHeading,
} from "@/lib/nav-zones";

test("resolveZoneForPathname maps routes to certified zones", () => {
  assert.equal(resolveZoneForPathname("/dashboard"), "OPERATIONS_CENTER");
  assert.equal(resolveZoneForPathname("/operations"), "OPERATIONS_CENTER");
  assert.equal(resolveZoneForPathname("/unit/abc"), "LOCATIONS");
  assert.equal(resolveZoneForPathname("/units"), "LOCATIONS");
  assert.equal(resolveZoneForPathname("/staffing"), "TODAYS_WORK");
  assert.equal(resolveZoneForPathname("/reports"), "REVIEW");
  assert.equal(resolveZoneForPathname("/employees/import"), "ADMINISTRATION");
});

test("resolveZoneForPathname uses longest-prefix matching", () => {
  assert.equal(resolveZoneForPathname("/admin/organization"), "ADMINISTRATION");
  assert.equal(resolveZoneForPathname("/employees/points-summary"), "ADMINISTRATION");
});

test("resolveZoneForPathPrefix matches pathPrefix values from AppRoute", () => {
  assert.equal(resolveZoneForPathPrefix("/dashboard"), "OPERATIONS_CENTER");
  assert.equal(resolveZoneForPathPrefix("/operations"), "OPERATIONS_CENTER");
  assert.equal(resolveZoneForPathPrefix("/units"), "LOCATIONS");
});

test("groupNavItemsByZone preserves nav order within zones and zone order globally", () => {
  const groups = groupNavItemsByZone([
    { label: "Reports", href: "/reports", zone: "REVIEW" },
    { label: "Workspace", href: "/workspace", zone: "WORKSPACE" },
    { label: "Today's Work", href: "/today", zone: "TODAYS_WORK" },
    { label: "Logs", href: "/logs", zone: "ADMINISTRATION" },
  ]);

  assert.deepEqual(
    groups.map((g) => g.zone),
    ["WORKSPACE", "TODAYS_WORK", "REVIEW", "ADMINISTRATION"],
  );
  assert.equal(groups[0]?.items[0]?.href, "/workspace");
  assert.equal(groups[0]?.items[0]?.label, "Dashboard");
});

test("normalizePrimaryNavLabel maps module labels to product-facing names", () => {
  // `/dashboard` is the retired Operations Center route; it now reads as the canonical Dashboard.
  assert.equal(normalizePrimaryNavLabel("/dashboard", "Dashboard"), "Dashboard");
  assert.equal(normalizePrimaryNavLabel("/workspace", "Workspace"), "Dashboard");
  assert.equal(normalizePrimaryNavLabel("/staffing", "Staffing"), "Schedule");
  assert.equal(normalizePrimaryNavLabel("/reports", "Reports"), "Audit / Reports");
  assert.equal(normalizePrimaryNavLabel("/units", "Units"), "Locations");
  assert.equal(normalizePrimaryNavLabel("/admin", "Admin"), "Admin");
  // Routes without an explicit product label fall back to their registry label.
  assert.equal(normalizePrimaryNavLabel("/employees", "Employee Builder"), "Employee Builder");
});

test("shouldShowZoneHeading hides redundant zone label for single matching link", () => {
  const solo = groupNavItemsByZone([
    { label: "Units", href: "/units", zone: "LOCATIONS" },
  ])[0]!;
  assert.equal(shouldShowZoneHeading(solo), false);

  const multi = groupNavItemsByZone([
    { label: "Employees", href: "/employees", zone: "ADMINISTRATION" },
    { label: "Admin", href: "/admin", zone: "ADMINISTRATION" },
  ])[0]!;
  assert.equal(shouldShowZoneHeading(multi), true);
});

test("resolveDefaultHomePath sends managers to Business Workspace", () => {
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "MANAGER" }),
    "/workspace",
  );
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "FACILITY_ADMINISTRATOR" }),
    "/workspace",
  );
});

test("resolveDefaultHomePath sends floor staff to unit workspace or locations", () => {
  assert.equal(
    resolveDefaultHomePath({
      authKind: "employee",
      role: "STAFF",
      activeUnitId: "unit-1",
    }),
    "/unit/unit-1",
  );
  assert.equal(
    resolveDefaultHomePath({
      authKind: "employee",
      role: "STAFF",
      lockedUnitId: "kiosk-unit",
      activeUnitId: "other-unit",
    }),
    "/unit/kiosk-unit",
  );
  assert.equal(
    resolveDefaultHomePath({ authKind: "employee", role: "STAFF" }),
    "/logs",
  );
});

test("the new Dashboard is home for managers only while its flag is on", () => {
  const previous = process.env.DASHBOARD_V2_ENABLED;
  process.env.DASHBOARD_V2_ENABLED = "true";
  try {
    assert.equal(resolveDefaultHomePath({ authKind: "user", role: "MANAGER" }), "/dashboard");
    assert.equal(resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }), "/today");
    assert.equal(dashboardNavHref("/workspace"), "/dashboard");
  } finally {
    if (previous === undefined) delete process.env.DASHBOARD_V2_ENABLED;
    else process.env.DASHBOARD_V2_ENABLED = previous;
  }
  assert.equal(dashboardNavHref("/workspace"), "/workspace");
});

test("resolveDefaultHomePath sends supervisors to Today's Work hub", () => {
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }),
    "/today",
  );
});
