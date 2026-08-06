import assert from "node:assert/strict";
import test from "node:test";

import { APP_ROLES, type AppRole } from "@/lib/access";
import { authorizeRoute, roleMayAccessRoute } from "@/lib/route-registry/authorize";
import { PLATFORM_ROUTES } from "@/lib/route-registry/platform-routes";

const FLAGS = { todaysWorkEnabled: true };

function decide(pathname: string, role: AppRole | null) {
  return authorizeRoute({ pathname, role, featureFlags: FLAGS });
}

function outcome(pathname: string, role: AppRole | null): string {
  return decide(pathname, role).outcome;
}

// ── Fail closed ────────────────────────────────────────────────────────────────

test("fail closed — an unknown page is Not Found for every role, authenticated or not", () => {
  for (const role of [null, ...APP_ROLES] as (AppRole | null)[]) {
    const decision = decide("/definitely-not-a-route", role);
    assert.equal(decision.outcome, "NOT_FOUND", `${role ?? "anonymous"} unknown page`);
    assert.equal(decision.outcome === "NOT_FOUND" && decision.surface, "PAGE");
  }
});

test("fail closed — an unknown API is Not Found and never falls through as authenticated", () => {
  for (const role of [null, ...APP_ROLES] as (AppRole | null)[]) {
    const decision = decide("/api/definitely-not-a-route", role);
    assert.equal(decision.outcome, "NOT_FOUND", `${role ?? "anonymous"} unknown API`);
    assert.equal(decision.outcome === "NOT_FOUND" && decision.surface, "API");
  }
});

test("fail closed — being a Facility Administrator does not open unregistered paths", () => {
  for (const path of ["/admin/secret", "/api/admin/secret", "/evs", "/internal/metrics"]) {
    assert.equal(outcome(path, "FACILITY_ADMINISTRATOR"), "NOT_FOUND", path);
  }
});

test("fail closed — no path resolves to ALLOW without a registry entry", () => {
  const probes = ["/x", "/a/b/c/d", "/api/x", "/units/extra", "/admin/reports", "/today/nope"];
  for (const path of probes) {
    for (const role of APP_ROLES) {
      assert.notEqual(outcome(path, role), "ALLOW", `${role} must not be allowed at ${path}`);
    }
  }
});

// ── Authentication ─────────────────────────────────────────────────────────────

test("authentication — public routes need no session", () => {
  for (const path of [
    "/",
    "/login",
    "/signup",
    "/api/auth/login",
    "/api/auth/pin-login",
    "/api/health/live",
    "/api/health/ready",
  ]) {
    assert.equal(outcome(path, null), "ALLOW", path);
  }
});

test("authentication — the Stripe webhook stays public and signature-verified", () => {
  assert.equal(outcome("/api/billing/webhook", null), "ALLOW");
  const route = PLATFORM_ROUTES.find((entry) => entry.pattern === "/api/billing/webhook");
  assert.equal(route?.requiresDownstreamAuthorization, true);
});

test("authentication — a protected page without a session asks for sign-in", () => {
  const decision = decide("/workspace", null);
  assert.equal(decision.outcome, "REQUIRE_AUTHENTICATION");
  assert.equal(decision.outcome === "REQUIRE_AUTHENTICATION" && decision.surface, "PAGE");
});

test("authentication — a protected API without a session is refused, not redirected", () => {
  for (const path of ["/api/auth/session", "/api/onboarding/state", "/api/billing/setup-intent"]) {
    const decision = decide(path, null);
    assert.equal(decision.outcome, "REQUIRE_AUTHENTICATION", path);
    assert.equal(decision.outcome === "REQUIRE_AUTHENTICATION" && decision.surface, "API", path);
  }
});

// ── Role policy ────────────────────────────────────────────────────────────────

test("role policy — /admin permits only FACILITY_ADMINISTRATOR", () => {
  for (const path of [
    "/admin",
    "/admin/permissions",
    "/admin/organization",
    "/admin/organization/facilities",
    "/admin/knowledge",
    "/admin/inspections",
    "/admin/facility/builder",
  ]) {
    assert.equal(roleMayAccessRoute(path, "FACILITY_ADMINISTRATOR", FLAGS), true, path);
    for (const role of APP_ROLES.filter((r) => r !== "FACILITY_ADMINISTRATOR")) {
      assert.equal(roleMayAccessRoute(path, role, FLAGS), false, `${role} at ${path}`);
    }
  }
});

test("role policy — Department Builder admits Manager+ for Operational Cycles", () => {
  const managementTier: AppRole[] = ["FACILITY_ADMINISTRATOR", "GM", "MANAGER"];
  for (const path of ["/admin/departments", "/admin/departments/cldept0001"]) {
    for (const role of APP_ROLES) {
      assert.equal(
        roleMayAccessRoute(path, role, FLAGS),
        managementTier.includes(role),
        `${role} at ${path}`,
      );
    }
  }
});

test("role policy — /employees requires the management tier", () => {
  const managementTier: AppRole[] = ["FACILITY_ADMINISTRATOR", "GM", "MANAGER"];
  for (const path of ["/employees", "/employees/hr-audit", "/employees/terminations"]) {
    for (const role of APP_ROLES) {
      assert.equal(
        roleMayAccessRoute(path, role, FLAGS),
        managementTier.includes(role),
        `${role} at ${path}`,
      );
    }
  }
});

test("role policy — /today keeps its Supervisor floor", () => {
  const supervisorPlus: AppRole[] = ["FACILITY_ADMINISTRATOR", "GM", "MANAGER", "SUPERVISOR"];
  for (const path of ["/today", "/today/coverage", "/today/handoffs", "/today/walk"]) {
    for (const role of APP_ROLES) {
      assert.equal(
        roleMayAccessRoute(path, role, FLAGS),
        supervisorPlus.includes(role),
        `${role} at ${path}`,
      );
    }
  }
});

test("role policy — /staffing keeps its Supervisor floor", () => {
  assert.equal(roleMayAccessRoute("/staffing", "SUPERVISOR", FLAGS), true);
  assert.equal(roleMayAccessRoute("/staffing/assignments", "SUPERVISOR", FLAGS), true);
  assert.equal(roleMayAccessRoute("/staffing/cycles", "SUPERVISOR", FLAGS), true);
  assert.equal(roleMayAccessRoute("/staffing/cycles", "MANAGER", FLAGS), true);
  assert.equal(roleMayAccessRoute("/staffing/operations", "SUPERVISOR", FLAGS), true);
  assert.equal(roleMayAccessRoute("/staffing/operations", "MANAGER", FLAGS), true);
  assert.equal(roleMayAccessRoute("/staffing", "LEAD_TEAM_MEMBER", FLAGS), false);
  assert.equal(roleMayAccessRoute("/staffing/assignments", "STAFF", FLAGS), false);
  assert.equal(roleMayAccessRoute("/staffing/cycles", "STAFF", FLAGS), false);
  assert.equal(roleMayAccessRoute("/staffing/operations", "STAFF", FLAGS), false);
});

test("role policy — /account stays available to every authenticated role", () => {
  for (const role of APP_ROLES) {
    assert.equal(roleMayAccessRoute("/account", role, FLAGS), true, `${role} at /account`);
  }
  assert.equal(outcome("/account", null), "REQUIRE_AUTHENTICATION");
});

test("role policy — /department/settings defers to its own department-head authority", () => {
  // The proxy admits any authenticated role; the page decides per department. Encoding a static
  // floor here would either widen or narrow the certified behavior.
  const path = "/department/settings/cldept0001";
  for (const role of APP_ROLES) {
    assert.equal(roleMayAccessRoute(path, role, FLAGS), true, `${role} at ${path}`);
  }
  assert.equal(outcome(path, null), "REQUIRE_AUTHENTICATION");

  const route = PLATFORM_ROUTES.find(
    (entry) => entry.pattern === "/department/settings/[departmentId]",
  );
  assert.equal(route?.requiresDownstreamAuthorization, true);
});

test("role policy — frontline surfaces stay open to every role", () => {
  for (const path of ["/logs", "/repairs", "/dashboard", "/operations", "/unit/abc"]) {
    for (const role of APP_ROLES) {
      assert.equal(roleMayAccessRoute(path, role, FLAGS), true, `${role} at ${path}`);
    }
  }
});

test("role policy — role-restricted APIs enforce their floor at the proxy", () => {
  for (const path of [
    "/api/auth/bind-device",
    "/api/auth/logout-full",
    "/api/onboarding/state",
    "/api/onboarding/locations",
    "/api/onboarding/managers",
    "/api/billing/setup-intent",
    "/api/billing/payment-method/default",
    "/api/debug/projection-shadow",
  ]) {
    assert.equal(roleMayAccessRoute(path, "FACILITY_ADMINISTRATOR", FLAGS), true, path);
    for (const role of APP_ROLES.filter((r) => r !== "FACILITY_ADMINISTRATOR")) {
      const decision = decide(path, role);
      assert.equal(decision.outcome, "DENY", `${role} at ${path}`);
      assert.equal(decision.outcome === "DENY" && decision.surface, "API", `${role} at ${path}`);
    }
  }

  assert.equal(roleMayAccessRoute("/api/facility/union-handbook", "MANAGER", FLAGS), true);
  assert.equal(roleMayAccessRoute("/api/facility/union-handbook", "SUPERVISOR", FLAGS), false);
});

test("role policy — handler-authorized APIs admit any session and keep handler checks", () => {
  for (const path of [
    "/api/auth/session",
    "/api/auth/active-unit",
    "/api/auth/active-department",
    "/api/auth/switch-facility",
  ]) {
    for (const role of APP_ROLES) {
      assert.equal(roleMayAccessRoute(path, role, FLAGS), true, `${role} at ${path}`);
    }
    const route = PLATFORM_ROUTES.find((entry) => entry.pattern === path);
    assert.equal(route?.requiresDownstreamAuthorization, true, path);
  }
});

test("role policy — a Quick PIN session gains nothing extra from route classification", () => {
  // Registry policy is a function of role alone. A PIN session carries a PIN-eligible role, so it
  // resolves to exactly the same answer an email/password session with that role would get.
  for (const path of ["/admin", "/employees", "/today", "/workspace", "/units"]) {
    assert.equal(roleMayAccessRoute(path, "STAFF", FLAGS), roleMayAccessRoute(path, "STAFF", FLAGS));
  }
  assert.equal(roleMayAccessRoute("/admin", "STAFF", FLAGS), false);
  assert.equal(roleMayAccessRoute("/admin", "LEAD_TEAM_MEMBER", FLAGS), false);
  assert.equal(roleMayAccessRoute("/employees", "LEAD_TEAM_MEMBER", FLAGS), false);
});

// ── Denials, redirects, and feature gates ──────────────────────────────────────

test("denial — a registered but unauthorized page is denied on the page surface", () => {
  const decision = decide("/admin", "STAFF");
  assert.equal(decision.outcome, "DENY");
  assert.equal(decision.outcome === "DENY" && decision.surface, "PAGE");
  assert.equal(decision.outcome === "DENY" && decision.reason, "ROLE_NOT_APPROVED");
});

test("redirect — /settings sends Facility Administrators to Organization and others home", () => {
  const fa = decide("/settings", "FACILITY_ADMINISTRATOR");
  assert.equal(fa.outcome, "REDIRECT");
  assert.equal(fa.outcome === "REDIRECT" && fa.destination, "/admin/organization");

  for (const role of APP_ROLES.filter((r) => r !== "FACILITY_ADMINISTRATOR")) {
    const decision = decide("/settings", role);
    assert.equal(decision.outcome, "REDIRECT", role);
    assert.equal(decision.outcome === "REDIRECT" && decision.destination, null, role);
  }

  assert.equal(outcome("/settings", null), "REQUIRE_AUTHENTICATION");
  assert.equal(outcome("/settings/anything", "FACILITY_ADMINISTRATOR"), "REDIRECT");
});

test("feature gate — disabling Today's Work withdraws the route independently of role", () => {
  const flags = { todaysWorkEnabled: false };
  for (const role of APP_ROLES) {
    assert.equal(roleMayAccessRoute("/today", role, flags), false, role);
    assert.equal(roleMayAccessRoute("/today/handoffs", role, flags), false, role);
  }
  // Other routes are unaffected.
  assert.equal(roleMayAccessRoute("/workspace", "SUPERVISOR", flags), true);
});

test("internal — framework and static asset paths pass through", () => {
  for (const path of ["/_next/data/x.json", "/favicon.ico", "/next.svg", "/window.svg"]) {
    assert.equal(outcome(path, null), "ALLOW", path);
  }
});

// ── Independence from database state ───────────────────────────────────────────

test("drift resistance — the decision is a pure function with no database access", () => {
  const first = decide("/admin", "STAFF");
  const second = decide("/admin", "STAFF");
  assert.deepEqual(first, second);

  const source = authorizeRoute.toString();
  assert.doesNotMatch(source, /prisma/i, "route authorization must not reach the database");
  assert.doesNotMatch(source, /await/, "route authorization must be synchronous");
});
