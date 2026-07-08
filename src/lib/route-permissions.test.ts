import test from "node:test";
import assert from "node:assert/strict";

import { resolveRouteAccess, type RoutePermissionRule } from "@/lib/route-permissions";
import { resolveZoneForPathPrefix } from "@/lib/nav-zones";

test("resolveRouteAccess uses longest-prefix matching", () => {
  const rules: RoutePermissionRule[] = [
    { pathPrefix: "/admin/organization", allowedRoleKeys: new Set(["FACILITY_ADMINISTRATOR"]) },
    { pathPrefix: "/admin", allowedRoleKeys: new Set(["FACILITY_ADMINISTRATOR", "MANAGER"]) },
  ];

  assert.equal(resolveRouteAccess("/admin/organization", "MANAGER", rules), false);
  assert.equal(resolveRouteAccess("/admin/settings", "MANAGER", rules), true);
});

test("resolveRouteAccess allows unmatched routes by default", () => {
  const rules: RoutePermissionRule[] = [{ pathPrefix: "/reports", allowedRoleKeys: new Set(["FACILITY_ADMINISTRATOR"]) }];
  assert.equal(resolveRouteAccess("/some-future-route", "STAFF", rules), true);
});

test("resolveZoneForPathPrefix aligns seeded top-nav routes with zones", () => {
  assert.equal(resolveZoneForPathPrefix("/dashboard"), "OPERATIONS_CENTER");
  assert.equal(resolveZoneForPathPrefix("/staffing"), "TODAYS_WORK");
  assert.equal(resolveZoneForPathPrefix("/admin"), "ADMINISTRATION");
});
