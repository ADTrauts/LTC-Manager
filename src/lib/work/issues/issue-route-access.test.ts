import assert from "node:assert/strict";
import test from "node:test";

import { APP_ROLES, ROLE_PRIORITY, type AppRole } from "@/lib/access";
import { pathnameAllowedForDepartmentKey } from "@/lib/department-nav";
import { resolveZoneForPathname } from "@/lib/nav-zones";
import {
  resolveRouteAccess,
  WAVE1_ROUTE_MIN_ROLES,
  type RoutePermissionRule,
} from "@/lib/route-permissions";
import { issueDetailPath, repairDetailAliasPath } from "@/lib/work/issues/issue-copy";

function buildFallbackRules(): RoutePermissionRule[] {
  return Object.entries(WAVE1_ROUTE_MIN_ROLES)
    .map(([pathPrefix, minRole]) => ({
      pathPrefix,
      allowedRoleKeys: new Set(
        APP_ROLES.filter((role) => ROLE_PRIORITY[role] >= ROLE_PRIORITY[minRole]),
      ),
    }))
    .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);
}

test("/issues inherits STAFF+ access like /repairs", () => {
  assert.equal(WAVE1_ROUTE_MIN_ROLES["/issues"], "STAFF");
  const rules = buildFallbackRules();
  for (const role of APP_ROLES) {
    const allowed = ROLE_PRIORITY[role as AppRole] >= ROLE_PRIORITY.STAFF;
    assert.equal(
      resolveRouteAccess("/issues/clxxxxxxxxxxxxxxxxxxxxxxxx", role, rules),
      allowed,
      `${role} /issues detail`,
    );
    assert.equal(
      resolveRouteAccess("/repairs/clxxxxxxxxxxxxxxxxxxxxxxxx", role, rules),
      allowed,
      `${role} /repairs alias`,
    );
  }
});

test("/issues maps to ADMINISTRATION zone and Dietary/Plant department visibility", () => {
  assert.equal(resolveZoneForPathname("/issues/abc"), "ADMINISTRATION");
  assert.equal(pathnameAllowedForDepartmentKey("/issues/abc", "DIETARY"), true);
  assert.equal(pathnameAllowedForDepartmentKey("/issues/abc", "PLANT"), true);
  assert.equal(pathnameAllowedForDepartmentKey("/issues/abc", "EVS"), false);
});

test("detail path helpers stay stable for bookmarks", () => {
  const id = "clissue000000000000000001";
  assert.equal(issueDetailPath(id), `/issues/${id}`);
  assert.equal(repairDetailAliasPath(id), `/repairs/${id}`);
});
