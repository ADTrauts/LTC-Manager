import test from "node:test";
import assert from "node:assert/strict";

import { resolveRouteAccess, type RoutePermissionRule } from "@/lib/route-permissions";

test("resolveRouteAccess uses longest-prefix matching", () => {
  const rules: RoutePermissionRule[] = [
    { pathPrefix: "/admin/organization", allowedRoleKeys: new Set(["GM"]) },
    { pathPrefix: "/admin", allowedRoleKeys: new Set(["GM", "MANAGER"]) },
  ];

  assert.equal(resolveRouteAccess("/admin/organization", "MANAGER", rules), false);
  assert.equal(resolveRouteAccess("/admin/settings", "MANAGER", rules), true);
});

test("resolveRouteAccess allows unmatched routes by default", () => {
  const rules: RoutePermissionRule[] = [{ pathPrefix: "/reports", allowedRoleKeys: new Set(["GM"]) }];
  assert.equal(resolveRouteAccess("/some-future-route", "STAFF", rules), true);
});
