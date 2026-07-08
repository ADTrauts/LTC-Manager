import assert from "node:assert/strict";
import test from "node:test";

import {
  groupNavItemsByZone,
  resolveDefaultHomePath,
  resolveZoneForPathname,
  resolveZoneForPathPrefix,
} from "@/lib/nav-zones";

test("resolveZoneForPathname maps routes to certified zones", () => {
  assert.equal(resolveZoneForPathname("/dashboard"), "OPERATIONS_CENTER");
  assert.equal(resolveZoneForPathname("/unit/abc"), "LOCATIONS");
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
  assert.equal(resolveZoneForPathPrefix("/units"), "ADMINISTRATION");
});

test("groupNavItemsByZone preserves nav order within zones and zone order globally", () => {
  const groups = groupNavItemsByZone([
    { label: "Reports", href: "/reports", zone: "REVIEW" },
    { label: "Dashboard", href: "/dashboard", zone: "OPERATIONS_CENTER" },
    { label: "Staffing", href: "/staffing", zone: "TODAYS_WORK" },
    { label: "Logs", href: "/logs", zone: "ADMINISTRATION" },
  ]);

  assert.deepEqual(
    groups.map((g) => g.zone),
    ["OPERATIONS_CENTER", "TODAYS_WORK", "REVIEW", "ADMINISTRATION"],
  );
  assert.equal(groups[0]?.items[0]?.href, "/dashboard");
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

test("resolveDefaultHomePath sends supervisors to Operations Center until Today's Work ships", () => {
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }),
    "/dashboard",
  );
});
