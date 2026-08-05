import assert from "node:assert/strict";
import test from "node:test";

import { APP_ROLES, ROLE_PRIORITY, type AppRole } from "@/lib/access";
import { pathnameAllowedForDepartmentKey } from "@/lib/department-nav";
import { isTodaysWorkEnabled } from "@/lib/feature-flags";
import { isTodaysWorkPathname, resolveDefaultHomePath } from "@/lib/nav-zones";
import { roleMayAccessRoute } from "@/lib/route-registry";

const TODAYS_WORK_PATHS = ["/today", "/today/walk", "/today/coverage", "/today/handoffs"] as const;

const SUPERVISOR_PLUS_ROLES: AppRole[] = APP_ROLES.filter(
  (role) => ROLE_PRIORITY[role] >= ROLE_PRIORITY.SUPERVISOR,
);

const BELOW_SUPERVISOR_ROLES: AppRole[] = APP_ROLES.filter(
  (role) => ROLE_PRIORITY[role] < ROLE_PRIORITY.SUPERVISOR,
);

const FLAGS = { todaysWorkEnabled: true };

function mayAccess(path: string, role: AppRole): boolean {
  return roleMayAccessRoute(path, role, FLAGS);
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
  for (const role of SUPERVISOR_PLUS_ROLES) {
    for (const path of TODAYS_WORK_PATHS) {
      assert.equal(mayAccess(path, role), true, `${role} should access ${path}`);
    }
  }
});

test("Today's Work RBAC — below-supervisor roles are denied all /today routes", () => {
  for (const role of BELOW_SUPERVISOR_ROLES) {
    for (const path of TODAYS_WORK_PATHS) {
      assert.equal(mayAccess(path, role), false, `${role} should be denied ${path}`);
    }
  }
});

test("Today's Work RBAC — unregistered /today descendants and lookalikes are denied", () => {
  // These paths do not exist in src/app. Under platform-owned policy they are unregistered, so no
  // role reaches them: an unmatched path is Not Found rather than inheriting the parent's grant.
  for (const role of [...SUPERVISOR_PLUS_ROLES, ...BELOW_SUPERVISOR_ROLES]) {
    assert.equal(mayAccess("/today/walk/nested", role), false, `${role} /today/walk/nested`);
    assert.equal(mayAccess("/today/coverage/details", role), false, `${role} /today/coverage/details`);
    assert.equal(mayAccess("/today/handoffs/archive", role), false, `${role} /today/handoffs/archive`);
    // Segment-boundary safety: /today-evil is a different first segment, not a child of /today.
    assert.equal(mayAccess("/today-evil", role), false, `${role} /today-evil`);
  }
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
  assert.equal(resolveDefaultHomePath({ authKind: "user", role: "MANAGER" }), "/workspace");
  assert.equal(resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }), "/today");
  assert.equal(resolveDefaultHomePath({ authKind: "employee", role: "STAFF" }), "/logs");
  assert.equal(
    resolveDefaultHomePath({ authKind: "employee", role: "STAFF", activeUnitId: "unit-1" }),
    "/unit/unit-1",
  );
});

test("Today's Work RBAC — staff retain Operations Center and unit workspace access", () => {
  assert.equal(mayAccess("/dashboard", "STAFF"), true);
  assert.equal(mayAccess("/operations", "STAFF"), true);
  assert.equal(mayAccess("/unit/abc", "STAFF"), true);
});

test("Today's Work RBAC — feature flag off keeps supervisor on Business Workspace", () => {
  withTodaysWorkFlag("false", () => {
    assert.equal(isTodaysWorkEnabled(), false);
    assert.equal(resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }), "/workspace");
  });
});

test("Today's Work RBAC — disabling the feature withdraws /today from every role", () => {
  for (const role of SUPERVISOR_PLUS_ROLES) {
    for (const path of TODAYS_WORK_PATHS) {
      assert.equal(
        roleMayAccessRoute(path, role, { todaysWorkEnabled: false }),
        false,
        `${role} should be blocked from ${path} while the feature is off`,
      );
    }
  }
});
