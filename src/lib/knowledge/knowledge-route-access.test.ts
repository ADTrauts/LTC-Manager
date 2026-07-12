import assert from "node:assert/strict";
import test from "node:test";

import { APP_ROLES, ROLE_PRIORITY, type AppRole } from "@/lib/access";
import {
  resolveRouteAccess,
  WAVE1_ROUTE_MIN_ROLES,
  type RoutePermissionRule,
} from "@/lib/route-permissions";

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

test("/admin/knowledge inherits /admin FACILITY_ADMINISTRATOR gate", () => {
  const rules = buildFallbackRules();
  assert.equal(
    resolveRouteAccess("/admin/knowledge", "FACILITY_ADMINISTRATOR" as AppRole, rules),
    true,
  );
  assert.equal(resolveRouteAccess("/admin/knowledge", "MANAGER" as AppRole, rules), false);
  assert.equal(resolveRouteAccess("/admin/knowledge/clxyz", "STAFF" as AppRole, rules), false);
});
