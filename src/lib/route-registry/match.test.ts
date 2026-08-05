import assert from "node:assert/strict";
import test from "node:test";

import { isApiPathname, matchPlatformRoute, normalizeRoutePattern } from "@/lib/route-registry/match";

function patternFor(pathname: string): string | null {
  return matchPlatformRoute(pathname)?.pattern ?? null;
}

test("matching — exact routes match only themselves", () => {
  assert.equal(patternFor("/units"), "/units");
  assert.equal(patternFor("/workspace"), "/workspace");
  assert.equal(patternFor("/admin"), "/admin");
  assert.equal(patternFor("/api/auth/login"), "/api/auth/login");
});

test("matching — dynamic segments capture exactly one segment", () => {
  assert.equal(patternFor("/unit/clunit0001"), "/unit/[unitId]");
  assert.equal(patternFor("/issues/clissue001"), "/issues/[issueId]");
  assert.equal(patternFor("/repairs/clrepair01"), "/repairs/[id]");
  assert.equal(patternFor("/admin/departments/cldept0001"), "/admin/departments/[departmentId]");
  assert.equal(
    patternFor("/department/settings/cldept0001"),
    "/department/settings/[departmentId]",
  );

  // One segment too deep is a different path, not a deeper match on the same route.
  assert.equal(patternFor("/unit/clunit0001/extra"), null);
  assert.equal(patternFor("/issues/clissue001/comments"), null);
});

test("matching — segment boundaries are respected", () => {
  // /unit and /units are separate registered routes and must never capture each other.
  assert.equal(patternFor("/units"), "/units");
  assert.equal(patternFor("/unit"), null);
  assert.equal(patternFor("/unit/abc"), "/unit/[unitId]");

  // A shared string prefix is not a path prefix.
  assert.equal(patternFor("/administration"), null);
  assert.equal(patternFor("/today-evil"), null);
  assert.equal(patternFor("/loginx"), null);
  assert.equal(patternFor("/employeesx"), null);
});

test("matching — longest specific match wins", () => {
  assert.equal(patternFor("/admin"), "/admin");
  assert.equal(patternFor("/admin/organization"), "/admin/organization");
  assert.equal(patternFor("/admin/organization/facilities"), "/admin/organization/facilities");
  assert.equal(patternFor("/employees"), "/employees");
  assert.equal(patternFor("/employees/hr-audit"), "/employees/hr-audit");
  assert.equal(patternFor("/today"), "/today");
  assert.equal(patternFor("/today/handoffs"), "/today/handoffs");
});

test("matching — a literal segment beats a dynamic one at the same depth", () => {
  // /repairs/[id] is registered; a literal sibling at the same depth would take precedence.
  assert.equal(patternFor("/admin/facility/builder"), "/admin/facility/builder");
  assert.equal(patternFor("/admin/facility/other"), null);
});

test("matching — prefix routes cover their descendants", () => {
  assert.equal(patternFor("/settings"), "/settings");
  assert.equal(patternFor("/settings/profile"), "/settings");
  assert.equal(patternFor("/settings/a/b/c"), "/settings");
  assert.equal(patternFor("/_next/data/build/x.json"), "/_next");
});

test("matching — trailing slashes normalize to the same route", () => {
  assert.equal(patternFor("/units/"), "/units");
  assert.equal(patternFor("/"), "/");
  assert.equal(patternFor("/today/handoffs/"), "/today/handoffs");
  assert.equal(patternFor("/unit/abc/"), "/unit/[unitId]");
});

test("matching — query strings and fragments do not affect the decision", () => {
  assert.equal(patternFor("/units?department=dietary"), "/units");
  assert.equal(patternFor("/today?date=2026-08-04#top"), "/today");
  assert.equal(patternFor("/unit/abc?tab=logs"), "/unit/[unitId]");
});

test("matching — unregistered paths return no route", () => {
  assert.equal(patternFor("/nope"), null);
  assert.equal(patternFor("/admin/nope"), null);
  assert.equal(patternFor("/api/nope"), null);
  assert.equal(patternFor("/api/auth/nope"), null);
  assert.equal(patternFor("/evs"), null);
  assert.equal(patternFor("/evs/rounds"), null);
});

test("matching — API paths are identified for API-shaped responses", () => {
  assert.equal(isApiPathname("/api/auth/login"), true);
  assert.equal(isApiPathname("/api/nope"), true);
  assert.equal(isApiPathname("/apixyz"), false);
  assert.equal(isApiPathname("/units"), false);
  assert.equal(isApiPathname("/"), false);
});

test("matching — pattern normalization is stable", () => {
  assert.equal(normalizeRoutePattern("/units/"), "/units");
  assert.equal(normalizeRoutePattern("/"), "/");
  assert.equal(normalizeRoutePattern("//admin//organization//"), "/admin/organization");
});
