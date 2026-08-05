import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { APP_ROLES } from "@/lib/access";
import { roleMayAccessRoute } from "@/lib/route-registry/authorize";
import { buildLegacyRouteMirror, type LegacyRouteMirror } from "@/lib/route-registry/legacy-mirror";
import { PLATFORM_ROUTES } from "@/lib/route-registry/platform-routes";

const MIRROR_PATH = resolve(process.cwd(), "prisma", "legacy-route-mirror.json");
const FLAGS = { todaysWorkEnabled: true };

function committedMirror(): LegacyRouteMirror {
  return JSON.parse(readFileSync(MIRROR_PATH, "utf8")) as LegacyRouteMirror;
}

test("legacy mirror — the committed seed file matches the registry exactly", () => {
  assert.deepEqual(
    committedMirror(),
    buildLegacyRouteMirror(),
    "prisma/legacy-route-mirror.json is stale. Run `npm run route-mirror:generate` and commit the result.",
  );
});

test("legacy mirror — generation is deterministic", () => {
  assert.deepEqual(buildLegacyRouteMirror(), buildLegacyRouteMirror());
});

test("legacy mirror — every area maps to exactly one row", () => {
  const { routes } = buildLegacyRouteMirror();
  const keys = routes.map((route) => route.key);
  const prefixes = routes.map((route) => route.pathPrefix);
  assert.equal(new Set(keys).size, keys.length, "duplicate AppRoute key");
  assert.equal(new Set(prefixes).size, prefixes.length, "duplicate AppRoute pathPrefix");
});

test("legacy mirror — /admin stays FACILITY_ADMINISTRATOR-only in the compatibility rows", () => {
  const admin = buildLegacyRouteMirror().routes.find((route) => route.pathPrefix === "/admin");
  assert.deepEqual(admin?.allowedRoles, ["FACILITY_ADMINISTRATOR"]);
});

test("legacy mirror — all six platform roles remain representable", () => {
  const mirrored = new Set(buildLegacyRouteMirror().routes.flatMap((route) => route.allowedRoles));
  for (const role of APP_ROLES) {
    assert.equal(mirrored.has(role), true, `${role} should appear somewhere in the mirror`);
  }
});

test("legacy mirror — mirrored grants never exceed what the registry allows", () => {
  // A mirror row stands for a whole product area, and an area prefix such as /issues is not itself
  // a route. The invariant that matters is that a role granted the area can reach every registered
  // route inside it, so the compatibility row can never be more permissive than the real policy.
  for (const row of buildLegacyRouteMirror().routes) {
    const areaRoutes = PLATFORM_ROUTES.filter(
      (route) =>
        route.surface === "PAGE" &&
        route.access.kind === "ROLE_RESTRICTED" &&
        (route.pattern === row.pathPrefix || route.pattern.startsWith(`${row.pathPrefix}/`)),
    );
    assert.ok(areaRoutes.length > 0, `${row.pathPrefix} mirrors no registered route`);

    for (const role of row.allowedRoles) {
      for (const route of areaRoutes) {
        assert.equal(
          roleMayAccessRoute(route.pattern, role, FLAGS),
          true,
          `${role} is granted ${row.pathPrefix} in the mirror but denied at ${route.pattern}`,
        );
      }
    }
  }
});

test("legacy mirror — removed and deferred routes are not recreated", () => {
  const prefixes = buildLegacyRouteMirror().routes.map((route) => route.pathPrefix);
  assert.equal(prefixes.includes("/evs"), false);
  assert.equal(
    prefixes.some((prefix) => prefix.startsWith("/evs")),
    false,
  );
});

test("legacy mirror — the file records that the tables are non-authoritative", () => {
  const mirror = committedMirror();
  assert.match(mirror.note, /Non-authoritative/i);
  assert.match(mirror.note, /never reads AppRoute or RoleRoutePermission/i);
  assert.equal(mirror.generatedFrom, "src/lib/route-registry/platform-routes.ts");
});

test("legacy mirror — seed carries no permission map of its own", () => {
  const seed = readFileSync(resolve(process.cwd(), "prisma", "seed.mjs"), "utf8");
  assert.match(seed, /LEGACY_ROUTE_MIRROR/);
  assert.doesNotMatch(seed, /ROUTE_MIN_ROLE/, "seed must not keep a second permission map");
  assert.doesNotMatch(seed, /ROUTE_DEFINITIONS/, "seed must not keep a second route list");
  assert.doesNotMatch(seed, /"\/evs"/, "seed must not recreate the deferred /evs route");
});
