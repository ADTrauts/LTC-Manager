import assert from "node:assert/strict";
import test from "node:test";

import { APP_ROLES, type AppRole } from "@/lib/access";
import { roleMayAccessRoute } from "@/lib/route-registry/authorize";
import { platformNavItemsForRole } from "@/lib/route-registry/navigation";
import { PLATFORM_ROUTES } from "@/lib/route-registry/platform-routes";

const FLAGS = { todaysWorkEnabled: true };

function hrefsFor(role: AppRole, flags = FLAGS): string[] {
  return platformNavItemsForRole(role, flags).map((item) => item.href);
}

test("navigation — every offered link is a route the role may actually reach", () => {
  for (const role of APP_ROLES) {
    for (const item of platformNavItemsForRole(role, FLAGS)) {
      assert.equal(
        roleMayAccessRoute(item.href, role, FLAGS),
        true,
        `${role} was offered ${item.href} without access`,
      );
    }
  }
});

test("navigation — no role is offered a link outside its policy", () => {
  assert.equal(hrefsFor("STAFF").includes("/admin"), false);
  assert.equal(hrefsFor("STAFF").includes("/employees"), false);
  assert.equal(hrefsFor("STAFF").includes("/workspace"), false);
  assert.equal(hrefsFor("SUPERVISOR").includes("/admin"), false);
  assert.equal(hrefsFor("SUPERVISOR").includes("/employees"), false);
  assert.equal(hrefsFor("MANAGER").includes("/admin"), false);
  assert.equal(hrefsFor("GM").includes("/admin"), false);
  assert.equal(hrefsFor("FACILITY_ADMINISTRATOR").includes("/admin"), true);
});

test("navigation — items are ordered by the registry order", () => {
  const items = platformNavItemsForRole("FACILITY_ADMINISTRATOR", FLAGS);
  const orders = items.map(
    (item) => PLATFORM_ROUTES.find((route) => route.pattern === item.href)?.nav?.order ?? -1,
  );
  assert.deepEqual([...orders].sort((a, b) => a - b), orders);
  assert.equal(items[0]?.href, "/workspace");
  assert.equal(items.at(-1)?.href, "/admin");
});

test("navigation — labels come from the registry, not from database rows", () => {
  const byHref = new Map(
    platformNavItemsForRole("FACILITY_ADMINISTRATOR", FLAGS).map((item) => [item.href, item.label]),
  );
  assert.equal(byHref.get("/workspace"), "Dashboard");
  assert.equal(byHref.get("/units"), "Locations");
  assert.equal(byHref.get("/reports"), "Review");
  assert.equal(byHref.get("/admin"), "Admin");
  assert.equal(byHref.get("/today"), "Today's Work");
  // Phase 13 product-mode surfaces.
  assert.equal(byHref.get("/staffing"), "Employees");
  assert.equal(byHref.get("/employees"), "Employee Builder");
  assert.equal(byHref.get("/admin/departments"), "Department Builder");
  assert.equal(byHref.get("/admin/facility/builder"), "Facility Builder");
  assert.equal(byHref.get("/admin/knowledge"), "Procedures & Resources");
});

test("navigation — absence from navigation does not deny access", () => {
  // /dashboard, /operations, /account and the dynamic detail routes are intentionally hidden.
  // They stay reachable by URL for the roles the registry approves.
  for (const path of ["/dashboard", "/operations", "/account"]) {
    assert.equal(hrefsFor("STAFF").includes(path), false, `${path} should be hidden`);
    assert.equal(roleMayAccessRoute(path, "STAFF", FLAGS), true, `${path} should stay reachable`);
  }
  // The Operations Center dashboard stays reachable by URL but is not offered in nav.
  assert.equal(hrefsFor("SUPERVISOR").includes("/dashboard"), false);
  assert.equal(roleMayAccessRoute("/dashboard", "SUPERVISOR", FLAGS), true);
});

test("navigation — Phase 13 RUN Employees surface is offered to supervisors", () => {
  // /staffing became the canonical RUN Employees surface (today's workforce operations).
  assert.equal(hrefsFor("SUPERVISOR").includes("/staffing"), true);
  assert.equal(roleMayAccessRoute("/staffing", "SUPERVISOR", FLAGS), true);
});

test("navigation — the Today's Work feature gate removes the link as well as the route", () => {
  const flags = { todaysWorkEnabled: false };
  for (const role of APP_ROLES) {
    assert.equal(hrefsFor(role, flags).includes("/today"), false, role);
  }
  assert.equal(hrefsFor("SUPERVISOR", FLAGS).includes("/today"), true);
});

test("navigation — redirect-only and internal routes never appear", () => {
  for (const role of APP_ROLES) {
    const hrefs = hrefsFor(role);
    assert.equal(hrefs.includes("/settings"), false, role);
    assert.equal(
      hrefs.some((href) => href.startsWith("/_next") || href.endsWith(".svg")),
      false,
      role,
    );
  }
});

test("navigation — /evs is absent for every role", () => {
  for (const role of APP_ROLES) {
    assert.equal(
      hrefsFor(role).some((href) => href.startsWith("/evs")),
      false,
      role,
    );
  }
});

test("navigation — role-specialized surfaces stay distinct", () => {
  const supervisor = hrefsFor("SUPERVISOR");
  assert.equal(supervisor.includes("/workspace"), true);
  assert.equal(supervisor.includes("/today"), true);
  assert.equal(supervisor.includes("/units"), true);
  assert.equal(hrefsFor("STAFF").includes("/logs"), true);
});

test("navigation — the projection reads no database", () => {
  const source = platformNavItemsForRole.toString();
  assert.doesNotMatch(source, /prisma/i);
  assert.doesNotMatch(source, /await/);
});
