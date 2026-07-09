import assert from "node:assert/strict";
import test from "node:test";

import { APP_ROLES, ROLE_PRIORITY, type AppRole } from "@/lib/access";
import { pathnameAllowedForDepartmentKey } from "@/lib/department-nav";
import { isTodaysWorkEnabled } from "@/lib/feature-flags";
import { isTodaysWorkPathname, resolveDefaultHomePath } from "@/lib/nav-zones";
import {
  resolveRouteAccess,
  WAVE1_ROUTE_MIN_ROLES,
  type RoutePermissionRule,
} from "@/lib/route-permissions";

const TODAYS_WORK_PATHS = ["/today", "/today/walk", "/today/coverage", "/today/handoffs"] as const;

const SUPERVISOR_PLUS_ROLES: AppRole[] = APP_ROLES.filter(
  (role) => ROLE_PRIORITY[role] >= ROLE_PRIORITY.SUPERVISOR,
);

const BELOW_SUPERVISOR_ROLES: AppRole[] = APP_ROLES.filter(
  (role) => ROLE_PRIORITY[role] < ROLE_PRIORITY.SUPERVISOR,
);

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

function withTodaysWorkFlag(value: string | undefined, fn: () => void) {
  const previous = process.env.TODAYS_WORK_ENABLED;
  if (value === undefined) {
    delete process.env.TODAYS_WORK_ENABLED;
  } else {
    process.env.TODAYS_WORK_ENABLED = value;
  }
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env.TODAYS_WORK_ENABLED;
    } else {
      process.env.TODAYS_WORK_ENABLED = previous;
    }
  }
}

test("Today's Work RBAC — supervisor+ roles can access all /today routes", () => {
  const rules = buildWave1FallbackRules();
  for (const role of SUPERVISOR_PLUS_ROLES) {
    for (const path of TODAYS_WORK_PATHS) {
      assert.equal(resolveRouteAccess(path, role, rules), true, `${role} should access ${path}`);
    }
  }
});

test("Today's Work RBAC — below-supervisor roles are denied all /today routes", () => {
  const rules = buildWave1FallbackRules();
  for (const role of BELOW_SUPERVISOR_ROLES) {
    for (const path of TODAYS_WORK_PATHS) {
      assert.equal(resolveRouteAccess(path, role, rules), false, `${role} should be denied ${path}`);
    }
  }
});

test("Today's Work RBAC — nested /today paths inherit supervisor gate", () => {
  const rules = buildWave1FallbackRules();
  assert.equal(resolveRouteAccess("/today/walk/nested", "SUPERVISOR", rules), true);
  assert.equal(resolveRouteAccess("/today/coverage/details", "MANAGER", rules), true);
  assert.equal(resolveRouteAccess("/today/handoffs/archive", "STAFF", rules), false);
  assert.equal(resolveRouteAccess("/today-evil", "STAFF", rules), true);
});

test("Today's Work RBAC — pathname detection covers hub and subpaths only", () => {
  for (const path of TODAYS_WORK_PATHS) {
    assert.equal(isTodaysWorkPathname(path), true, path);
  }
  assert.equal(isTodaysWorkPathname("/today/"), true);
  assert.equal(isTodaysWorkPathname("/dashboard"), false);
  assert.equal(isTodaysWorkPathname("/staffing"), false);
});

test("Today's Work RBAC — shared across operational department modes", () => {
  for (const key of ["DIETARY", "EVS", "PLANT", null] as const) {
    for (const path of TODAYS_WORK_PATHS) {
      assert.equal(pathnameAllowedForDepartmentKey(path, key), true, `${path} for ${key ?? "all"}`);
    }
  }
});

test("Today's Work RBAC — floor and manager homes stay off /today", () => {
  assert.equal(resolveDefaultHomePath({ authKind: "user", role: "MANAGER" }), "/dashboard");
  assert.equal(resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }), "/today");
  assert.equal(resolveDefaultHomePath({ authKind: "employee", role: "STAFF" }), "/logs");
  assert.equal(
    resolveDefaultHomePath({ authKind: "employee", role: "STAFF", activeUnitId: "unit-1" }),
    "/unit/unit-1",
  );
});

test("Today's Work RBAC — staff retain Operations Center and unit workspace access", () => {
  const rules = buildWave1FallbackRules();
  assert.equal(resolveRouteAccess("/dashboard", "STAFF", rules), true);
  assert.equal(resolveRouteAccess("/operations", "STAFF", rules), true);
  assert.equal(resolveRouteAccess("/unit/abc", "STAFF", rules), true);
});

test("Today's Work RBAC — feature flag off keeps supervisor on Operations Center", () => {
  withTodaysWorkFlag("false", () => {
    assert.equal(isTodaysWorkEnabled(), false);
    assert.equal(resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }), "/dashboard");
  });
});
