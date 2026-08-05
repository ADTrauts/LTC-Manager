import assert from "node:assert/strict";
import test from "node:test";

import { APP_ROLES, type AppRole } from "@/lib/access";
import { pathnameAllowedForDepartmentKey } from "@/lib/department-nav";
import { isTodaysWorkPathname, resolveDefaultHomePath } from "@/lib/nav-zones";
import { PLATFORM_ROUTES, roleMayAccessRoute } from "@/lib/route-registry";

const FLAGS = { todaysWorkEnabled: true };

function mayAccess(path: string, role: AppRole): boolean {
  return roleMayAccessRoute(path, role, FLAGS);
}

const WAVE1_RBAC_MATRIX: { role: AppRole; path: string }[] = [
  { role: "FACILITY_ADMINISTRATOR", path: "/admin" },
  { role: "MANAGER", path: "/employees" },
  { role: "MANAGER", path: "/reports" },
  { role: "SUPERVISOR", path: "/units" },
  { role: "SUPERVISOR", path: "/staffing" },
  { role: "SUPERVISOR", path: "/today" },
  { role: "SUPERVISOR", path: "/today/walk" },
  { role: "SUPERVISOR", path: "/today/coverage" },
  { role: "SUPERVISOR", path: "/today/handoffs" },
  { role: "MANAGER", path: "/today" },
  { role: "MANAGER", path: "/today/walk" },
  { role: "MANAGER", path: "/today/coverage" },
  { role: "MANAGER", path: "/today/handoffs" },
  { role: "MANAGER", path: "/workspace" },
  { role: "SUPERVISOR", path: "/workspace" },
  { role: "STAFF", path: "/logs" },
  { role: "STAFF", path: "/unit/abc" },
  { role: "STAFF", path: "/dashboard" },
  { role: "STAFF", path: "/operations" },
];

const WAVE1_RBAC_DENIALS: { role: AppRole; path: string }[] = [
  { role: "STAFF", path: "/workspace" },
  { role: "STAFF", path: "/admin" },
  { role: "STAFF", path: "/employees" },
  { role: "STAFF", path: "/reports" },
  { role: "STAFF", path: "/units" },
  { role: "STAFF", path: "/staffing" },
  { role: "STAFF", path: "/today" },
  { role: "STAFF", path: "/today/walk" },
  { role: "STAFF", path: "/today/coverage" },
  { role: "STAFF", path: "/today/handoffs" },
  { role: "LEAD_TEAM_MEMBER", path: "/today" },
  { role: "SUPERVISOR", path: "/admin" },
  { role: "MANAGER", path: "/admin" },
];

test("Wave 1 RBAC matrix — entitled roles pass platform route policy", () => {
  for (const { role, path } of WAVE1_RBAC_MATRIX) {
    assert.equal(mayAccess(path, role), true, `${role} should access ${path}`);
  }
});

test("Wave 1 RBAC matrix — under-privileged roles are denied", () => {
  for (const { role, path } of WAVE1_RBAC_DENIALS) {
    assert.equal(mayAccess(path, role), false, `${role} should be denied ${path}`);
  }
});

test("Wave 1 RBAC matrix — every role-restricted page matches its approved role list", () => {
  const restricted = PLATFORM_ROUTES.filter(
    (route) => route.surface === "PAGE" && route.access.kind === "ROLE_RESTRICTED",
  );
  assert.ok(restricted.length > 0, "registry should declare role-restricted pages");

  for (const route of restricted) {
    if (route.access.kind !== "ROLE_RESTRICTED") continue;
    for (const role of APP_ROLES) {
      assert.equal(
        mayAccess(route.pattern, role),
        route.access.allowedRoles.includes(role),
        `${role} access to ${route.pattern}`,
      );
    }
  }
});

test("Wave 1 RBAC matrix — /today paths are detected for proxy gating", () => {
  assert.equal(isTodaysWorkPathname("/today"), true);
  assert.equal(isTodaysWorkPathname("/today/walk"), true);
  assert.equal(isTodaysWorkPathname("/today/coverage"), true);
  assert.equal(isTodaysWorkPathname("/today/handoffs"), true);
  assert.equal(isTodaysWorkPathname("/dashboard"), false);
});

test("Wave 1 RBAC matrix — /today is shared across operational modes", () => {
  for (const key of ["DIETARY", "EVS", "PLANT", null] as const) {
    assert.equal(pathnameAllowedForDepartmentKey("/today", key), true);
    assert.equal(pathnameAllowedForDepartmentKey("/today/walk", key), true);
    assert.equal(pathnameAllowedForDepartmentKey("/today/coverage", key), true);
    assert.equal(pathnameAllowedForDepartmentKey("/today/handoffs", key), true);
  }
});

test("Wave 1 RBAC matrix — floor default home avoids /units redirect loop", () => {
  assert.equal(resolveDefaultHomePath({ authKind: "employee", role: "STAFF" }), "/logs");
  assert.equal(
    resolveDefaultHomePath({
      authKind: "employee",
      role: "STAFF",
      activeUnitId: "unit-1",
    }),
    "/unit/unit-1",
  );
});

test("Wave 1 RBAC matrix — manager homes on Workspace; supervisor homes on Today's Work", () => {
  assert.equal(resolveDefaultHomePath({ authKind: "user", role: "MANAGER" }), "/workspace");
  assert.equal(resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }), "/today");
});

test("Wave 1 RBAC matrix — /today subpaths keep the supervisor+ gate", () => {
  assert.equal(mayAccess("/today/handoffs", "SUPERVISOR"), true);
  assert.equal(mayAccess("/today/handoffs", "STAFF"), false);
});
