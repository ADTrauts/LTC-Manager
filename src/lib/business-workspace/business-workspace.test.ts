import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessBusinessWorkspace,
  greetingForLocalHour,
  healthToneFromReadiness,
  orderedWorkspaceSections,
  resolveWorkspaceSections,
  workspaceSectionVisible,
} from "@/lib/business-workspace";
import { resolveDefaultHomePath, resolveZoneForPathPrefix, normalizePrimaryNavLabel } from "@/lib/nav-zones";
import { resolveRouteAccess, WAVE1_ROUTE_MIN_ROLES, type RoutePermissionRule } from "@/lib/route-permissions";
import { APP_ROLES, ROLE_PRIORITY, type AppRole } from "@/lib/access";

test("canAccessBusinessWorkspace excludes staff and lead", () => {
  assert.equal(canAccessBusinessWorkspace("STAFF"), false);
  assert.equal(canAccessBusinessWorkspace("LEAD_TEAM_MEMBER"), false);
  assert.equal(canAccessBusinessWorkspace("SUPERVISOR"), true);
  assert.equal(canAccessBusinessWorkspace("MANAGER"), true);
  assert.equal(canAccessBusinessWorkspace("FACILITY_ADMINISTRATOR"), true);
});

test("supervisor sees limited workspace sections", () => {
  const sections = resolveWorkspaceSections("SUPERVISOR");
  assert.deepEqual(sections, ["priorities", "todays_work", "operations"]);
  assert.equal(workspaceSectionVisible("SUPERVISOR", "department_health"), false);
  assert.equal(workspaceSectionVisible("SUPERVISOR", "performance"), false);
});

test("manager and FA see full workspace sections", () => {
  for (const role of ["MANAGER", "GM", "FACILITY_ADMINISTRATOR"] as const) {
    const sections = resolveWorkspaceSections(role);
    assert.ok(sections.includes("priorities"));
    assert.ok(sections.includes("department_health"));
    assert.ok(sections.includes("performance"));
    assert.ok(sections.includes("recent_activity"));
  }
});

test("orderedWorkspaceSections preserves layout order", () => {
  const ordered = orderedWorkspaceSections(["operations", "priorities"]);
  assert.deepEqual(
    ordered.map((s) => s.id),
    ["priorities", "operations"],
  );
});

test("greetingForLocalHour is calm and uses first name", () => {
  assert.equal(greetingForLocalHour(8, "Andrew Smith"), "Good morning Andrew");
  assert.equal(greetingForLocalHour(14, "Andrew"), "Good afternoon Andrew");
  assert.equal(greetingForLocalHour(20, "Andrew"), "Good evening Andrew");
});

test("healthToneFromReadiness maps blocked/in-progress/ready", () => {
  assert.equal(healthToneFromReadiness({ blocked: 1, inProgress: 0, total: 3 }), "red");
  assert.equal(healthToneFromReadiness({ blocked: 0, inProgress: 2, total: 3 }), "yellow");
  assert.equal(healthToneFromReadiness({ blocked: 0, inProgress: 0, total: 3 }), "green");
  assert.equal(healthToneFromReadiness({ blocked: 0, inProgress: 0, total: 0 }), "neutral");
});

test("manager default home is Business Workspace", () => {
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "MANAGER" }),
    "/workspace",
  );
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "FACILITY_ADMINISTRATOR" }),
    "/workspace",
  );
});

test("supervisor default home remains Today's Work when enabled", () => {
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }),
    "/today",
  );
});

test("staff never default to workspace", () => {
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "STAFF", activeUnitId: "u1" }),
    "/unit/u1",
  );
  assert.equal(
    resolveDefaultHomePath({ authKind: "employee", role: "STAFF" }),
    "/logs",
  );
});

test("workspace route is SUPERVISOR+ in WAVE1 fallback", () => {
  assert.equal(WAVE1_ROUTE_MIN_ROLES["/workspace"], "SUPERVISOR");
  const rules: RoutePermissionRule[] = Object.entries(WAVE1_ROUTE_MIN_ROLES)
    .map(([pathPrefix, minRole]) => ({
      pathPrefix,
      allowedRoleKeys: new Set(
        APP_ROLES.filter((role) => ROLE_PRIORITY[role] >= ROLE_PRIORITY[minRole as AppRole]),
      ),
    }))
    .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);

  assert.equal(resolveRouteAccess("/workspace", "STAFF", rules), false);
  assert.equal(resolveRouteAccess("/workspace", "SUPERVISOR", rules), true);
  assert.equal(resolveRouteAccess("/workspace", "MANAGER", rules), true);
});

test("workspace maps to Workspace nav zone and label", () => {
  assert.equal(resolveZoneForPathPrefix("/workspace"), "WORKSPACE");
  assert.equal(normalizePrimaryNavLabel("/workspace", "Workspace"), "Workspace");
});
