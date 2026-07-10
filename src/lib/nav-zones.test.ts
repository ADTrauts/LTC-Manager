import assert from "node:assert/strict";
import test from "node:test";

import {
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
  assert.equal(resolveZoneForPathname("/evs"), "OPERATIONS_CENTER");
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
    { label: "Dashboard", href: "/dashboard", zone: "OPERATIONS_CENTER" },
    { label: "Today's Work", href: "/today", zone: "TODAYS_WORK" },
    { label: "Logs", href: "/logs", zone: "ADMINISTRATION" },
  ]);

  assert.deepEqual(
    groups.map((g) => g.zone),
    ["OPERATIONS_CENTER", "TODAYS_WORK", "REVIEW", "ADMINISTRATION"],
  );
  assert.equal(groups[0]?.items[0]?.href, "/dashboard");
  assert.equal(groups[0]?.items[0]?.label, "Operations Center");
});

test("normalizePrimaryNavLabel maps legacy module labels to zone names", () => {
  assert.equal(normalizePrimaryNavLabel("/dashboard", "Dashboard"), "Operations Center");
  assert.equal(normalizePrimaryNavLabel("/staffing", "Staffing"), "Today's Work");
  assert.equal(normalizePrimaryNavLabel("/reports", "Reports"), "Review");
  assert.equal(normalizePrimaryNavLabel("/units", "Units"), "Locations");
  assert.equal(normalizePrimaryNavLabel("/admin", "Admin"), "Administration");
  assert.equal(normalizePrimaryNavLabel("/employees", "Employees"), "Employees");
});

test("shouldShowZoneHeading hides redundant zone label for single matching link", () => {
  const solo = groupNavItemsByZone([
    { label: "Dashboard", href: "/dashboard", zone: "OPERATIONS_CENTER" },
  ])[0]!;
  assert.equal(shouldShowZoneHeading(solo), false);

  const multi = groupNavItemsByZone([
    { label: "Employees", href: "/employees", zone: "ADMINISTRATION" },
    { label: "Admin", href: "/admin", zone: "ADMINISTRATION" },
  ])[0]!;
  assert.equal(shouldShowZoneHeading(multi), true);
});

test("resolveDefaultHomePath sends managers to Operations Center", () => {
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "MANAGER" }),
    "/dashboard",
  );
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "FACILITY_ADMINISTRATOR" }),
    "/dashboard",
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

test("resolveDefaultHomePath sends supervisors to Today's Work hub", () => {
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }),
    "/today",
  );
});
