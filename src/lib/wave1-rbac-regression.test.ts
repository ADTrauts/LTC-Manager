import assert from "node:assert/strict";
import test from "node:test";

import { APP_ROLES, ROLE_PRIORITY, type AppRole } from "@/lib/access";
import { pathnameAllowedForDepartmentKey } from "@/lib/department-nav";
import { isTodaysWorkPathname, resolveDefaultHomePath } from "@/lib/nav-zones";
import {
  resolveRouteAccess,
  WAVE1_ROUTE_MIN_ROLES,
  type RoutePermissionRule,
} from "@/lib/route-permissions";

function buildWave1FallbackRules(): RoutePermissionRule[] {
  return Object.entries(WAVE1_ROUTE_MIN_ROLES)
    .map(([pathPrefix, minRole]) => ({
      pathPrefix,
      allowedRoleKeys: new Set(
        APP_ROLES.filter((role) => ROLE_PRIORITY[role] >= ROLE_PRIORITY[minRole]),
      ),
    }))
    .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);
}

function roleShouldAccessRoute(role: AppRole, pathPrefix: string): boolean {
  const minRole = WAVE1_ROUTE_MIN_ROLES[pathPrefix];
  assert.ok(minRole, `missing min role for ${pathPrefix}`);
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY[minRole];
}

const WAVE1_RBAC_MATRIX: { role: AppRole; path: string }[] = [
  { role: "FACILITY_ADMINISTRATOR", path: "/admin" },
  { role: "MANAGER", path: "/employees" },
  { role: "MANAGER", path: "/reports" },
  { role: "SUPERVISOR", path: "/units" },
  { role: "SUPERVISOR", path: "/staffing" },
  { role: "SUPERVISOR", path: "/today" },
  { role: "SUPERVISOR", path: "/today/walk" },
  { role: "STAFF", path: "/logs" },
  { role: "STAFF", path: "/unit/abc" },
  { role: "STAFF", path: "/dashboard" },
  { role: "STAFF", path: "/operations" },
];

const WAVE1_RBAC_DENIALS: { role: AppRole; path: string }[] = [
  { role: "STAFF", path: "/admin" },
  { role: "STAFF", path: "/employees" },
  { role: "STAFF", path: "/reports" },
  { role: "STAFF", path: "/units" },
  { role: "STAFF", path: "/staffing" },
  { role: "STAFF", path: "/today" },
  { role: "STAFF", path: "/today/coverage" },
  { role: "LEAD_TEAM_MEMBER", path: "/today" },
  { role: "SUPERVISOR", path: "/admin" },
  { role: "MANAGER", path: "/admin" },
];

test("Wave 1 RBAC matrix — entitled roles pass fallback route rules", () => {
  const rules = buildWave1FallbackRules();
  for (const { role, path } of WAVE1_RBAC_MATRIX) {
    assert.equal(
      resolveRouteAccess(path, role, rules),
      true,
      `${role} should access ${path}`,
    );
  }
});

test("Wave 1 RBAC matrix — under-privileged roles are denied", () => {
  const rules = buildWave1FallbackRules();
  for (const { role, path } of WAVE1_RBAC_DENIALS) {
    assert.equal(
      resolveRouteAccess(path, role, rules),
      false,
      `${role} should be denied ${path}`,
    );
  }
});

test("Wave 1 RBAC matrix — every seeded route min role matches expectations", () => {
  const rules = buildWave1FallbackRules();
  for (const pathPrefix of Object.keys(WAVE1_ROUTE_MIN_ROLES)) {
    for (const role of APP_ROLES) {
      const expected = roleShouldAccessRoute(role, pathPrefix);
      assert.equal(
        resolveRouteAccess(pathPrefix, role, rules),
        expected,
        `${role} access to ${pathPrefix}`,
      );
    }
  }
});

test("Wave 1 RBAC matrix — /today paths are detected for proxy gating", () => {
  assert.equal(isTodaysWorkPathname("/today"), true);
  assert.equal(isTodaysWorkPathname("/today/walk"), true);
  assert.equal(isTodaysWorkPathname("/dashboard"), false);
});

test("Wave 1 RBAC matrix — /today is shared across operational modes", () => {
  for (const key of ["DIETARY", "EVS", "PLANT", null] as const) {
    assert.equal(pathnameAllowedForDepartmentKey("/today", key), true);
    assert.equal(pathnameAllowedForDepartmentKey("/today/walk", key), true);
  }
});

test("Wave 1 RBAC matrix — floor default home avoids /units redirect loop", () => {
  assert.equal(
    resolveDefaultHomePath({ authKind: "employee", role: "STAFF" }),
    "/logs",
  );
  assert.equal(
    resolveDefaultHomePath({
      authKind: "employee",
      role: "STAFF",
      activeUnitId: "unit-1",
    }),
    "/unit/unit-1",
  );
});

test("Wave 1 RBAC matrix — manager stays on Operations Center; supervisor homes on Today's Work", () => {
  assert.equal(resolveDefaultHomePath({ authKind: "user", role: "MANAGER" }), "/dashboard");
  assert.equal(resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }), "/today");
});

test("Wave 1 RBAC matrix — /today subpaths inherit supervisor+ gate", () => {
  const rules = buildWave1FallbackRules();
  assert.equal(resolveRouteAccess("/today/handoffs", "SUPERVISOR", rules), true);
  assert.equal(resolveRouteAccess("/today/handoffs", "STAFF", rules), false);
});
