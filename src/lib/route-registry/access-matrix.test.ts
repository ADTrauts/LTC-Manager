import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { APP_ROLES } from "@/lib/access";
import { buildAccessMatrix } from "@/lib/route-registry/access-matrix";
import { roleMayAccessRoute } from "@/lib/route-registry/authorize";
import { PLATFORM_ROUTES } from "@/lib/route-registry/platform-routes";

const FLAGS = { todaysWorkEnabled: true };
const PERMISSIONS_DIR = resolve(process.cwd(), "src", "app", "(protected)", "admin", "permissions");

function permissionsSources(): { name: string; source: string }[] {
  return readdirSync(PERMISSIONS_DIR).map((name) => ({
    name,
    source: readFileSync(join(PERMISSIONS_DIR, name), "utf8"),
  }));
}

test("access matrix — every cell reports the real authorization decision", () => {
  const matrix = buildAccessMatrix(FLAGS);
  const rows = [...matrix.pageGroups, ...matrix.apiGroups].flatMap((group) => group.rows);

  for (const row of rows) {
    const route = PLATFORM_ROUTES.find((entry) => entry.pattern === row.pattern);
    if (route?.access.kind === "REDIRECT_ONLY") continue;
    for (const role of APP_ROLES) {
      assert.equal(
        row.allowedByRole[role],
        roleMayAccessRoute(row.pattern, role, FLAGS),
        `${role} at ${row.pattern}`,
      );
    }
  }
});

test("access matrix — covers every registered page and API route", () => {
  const matrix = buildAccessMatrix(FLAGS);
  const shown = new Set(
    [...matrix.pageGroups, ...matrix.apiGroups].flatMap((group) =>
      group.rows.map((row) => row.pattern),
    ),
  );
  for (const route of PLATFORM_ROUTES) {
    if (route.surface === "INTERNAL") continue;
    assert.equal(shown.has(route.pattern), true, `${route.pattern} missing from the matrix`);
  }
});

test("access matrix — /admin shows as Facility Administrator only", () => {
  const admin = buildAccessMatrix(FLAGS)
    .pageGroups.flatMap((group) => group.rows)
    .find((row) => row.pattern === "/admin");

  assert.ok(admin);
  assert.equal(admin.allowedByRole.FACILITY_ADMINISTRATOR, true);
  for (const role of APP_ROLES.filter((r) => r !== "FACILITY_ADMINISTRATOR")) {
    assert.equal(admin.allowedByRole[role], false, role);
  }
});

test("access matrix — no /evs row appears", () => {
  const matrix = buildAccessMatrix(FLAGS);
  const rows = [...matrix.pageGroups, ...matrix.apiGroups].flatMap((group) => group.rows);
  assert.equal(
    rows.some((row) => row.pattern.startsWith("/evs")),
    false,
  );
});

test("access matrix — the page surface hides internal API detail from the default view", () => {
  const matrix = buildAccessMatrix(FLAGS);
  const pagePatterns = matrix.pageGroups.flatMap((group) => group.rows.map((row) => row.pattern));
  assert.equal(
    pagePatterns.some((pattern) => pattern.startsWith("/api/")),
    false,
  );
  assert.ok(matrix.apiGroups.length > 0, "API policy is available separately for developers");
});

test("access matrix — the screen holds no mutation path", () => {
  for (const { name, source } of permissionsSources()) {
    assert.doesNotMatch(source, /"use server"/, `${name} must not declare a Server Action`);
    assert.doesNotMatch(source, /<form/, `${name} must not render a form`);
    assert.doesNotMatch(source, /<button/, `${name} must not render a submit control`);
    assert.doesNotMatch(source, /<input/, `${name} must not render an input`);
    assert.doesNotMatch(source, /<select/, `${name} must not render a select`);
    assert.doesNotMatch(source, /prisma\./, `${name} must not read or write the database directly`);
    assert.doesNotMatch(
      source,
      /appRoute|roleRoutePermission/i,
      `${name} must not touch the legacy permission tables`,
    );
  }
});

test("access matrix — the permission mutation actions are gone, not merely hidden", () => {
  const files = readdirSync(PERMISSIONS_DIR).sort();
  assert.deepEqual(files, ["access-matrix.tsx", "page.tsx"]);

  const wholeApp = resolve(process.cwd(), "src");
  const offenders = findMutationCallers(wholeApp);
  assert.deepEqual(offenders, [], "route-permission mutation actions must not exist anywhere");
});

function findMutationCallers(dir: string): string[] {
  const removed = [
    "setRoutePermissionAction",
    "cloneRolePermissionsAction",
    "createRoleAction",
    "updateRoleAction",
  ];
  const hits: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      hits.push(...findMutationCallers(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (full.endsWith("access-matrix.test.ts")) continue;
    const source = readFileSync(full, "utf8");
    for (const symbol of removed) {
      if (source.includes(symbol)) hits.push(`${full}: ${symbol}`);
    }
  }

  return hits;
}

test("access matrix — the page states that role capability is platform-managed", () => {
  // JSX wraps prose across lines, so compare against a whitespace-normalized copy.
  const copy = readFileSync(join(PERMISSIONS_DIR, "access-matrix.tsx"), "utf8").replace(/\s+/g, " ");
  assert.match(copy, /Platform-managed access/);
  assert.match(copy, /You assign people to roles/i);
  assert.match(copy, /you cannot change what a role is allowed to reach/i);
});

test("access matrix — the page renders the registry rather than database state", () => {
  const pageSource = readFileSync(join(PERMISSIONS_DIR, "page.tsx"), "utf8");
  assert.match(pageSource, /buildAccessMatrix/);
  assert.match(pageSource, /assertFacilityAdministratorPage/);
  assert.doesNotMatch(pageSource, /prisma/);
});
