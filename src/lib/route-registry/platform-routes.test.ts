import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { PLATFORM_ROUTES } from "@/lib/route-registry/platform-routes";
import { normalizeRoutePattern } from "@/lib/route-registry/match";
import { ROUTE_ACCESS_KINDS } from "@/lib/route-registry/types";

const APP_DIR = resolve(process.cwd(), "src", "app");

type DiscoveredRoute = { pattern: string; surface: "PAGE" | "API" };

/**
 * Enumerate the routes Next.js will actually serve from `src/app`.
 *
 * Route groups (`(protected)`) contribute no URL segment. Dynamic and catch-all segments are kept
 * verbatim so they can be compared to registry patterns character for character. Everything that is
 * not a `page.tsx` or `route.ts` — layouts, Server Action modules, colocated components — produces
 * no route and is skipped.
 */
function discoverAppRoutes(dir: string = APP_DIR, urlSegments: string[] = []): DiscoveredRoute[] {
  const found: DiscoveredRoute[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const isRouteGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
      const nextSegments = isRouteGroup ? urlSegments : [...urlSegments, entry.name];
      found.push(...discoverAppRoutes(join(dir, entry.name), nextSegments));
      continue;
    }
    if (entry.name === "page.tsx") {
      found.push({ pattern: normalizeRoutePattern(`/${urlSegments.join("/")}`), surface: "PAGE" });
    }
    if (entry.name === "route.ts") {
      found.push({ pattern: normalizeRoutePattern(`/${urlSegments.join("/")}`), surface: "API" });
    }
  }

  return found;
}

/** Discovered routes that the registry does not classify. Empty is the only acceptable result. */
export function unregisteredRoutes(
  discovered: readonly DiscoveredRoute[],
  registered: ReadonlySet<string>,
): DiscoveredRoute[] {
  return discovered.filter((route) => !registered.has(route.pattern));
}

const DISCOVERED = discoverAppRoutes();
const REGISTERED_PATTERNS = new Set(
  PLATFORM_ROUTES.map((route) => normalizeRoutePattern(route.pattern)),
);

test("registry completeness — every page and API route in src/app is classified", () => {
  const missing = unregisteredRoutes(DISCOVERED, REGISTERED_PATTERNS);
  assert.deepEqual(
    missing,
    [],
    `Unregistered routes found. Add them to src/lib/route-registry/platform-routes.ts:\n${missing
      .map((route) => `  ${route.surface} ${route.pattern}`)
      .join("\n")}`,
  );
});

test("registry completeness — a new unregistered route fails the check", () => {
  // Proves the check has teeth rather than passing vacuously.
  const fixture: DiscoveredRoute[] = [
    ...DISCOVERED,
    { pattern: "/brand-new-feature", surface: "PAGE" },
    { pattern: "/api/brand-new-feature", surface: "API" },
  ];
  const missing = unregisteredRoutes(fixture, REGISTERED_PATTERNS);
  assert.deepEqual(missing.map((route) => route.pattern).sort(), [
    "/api/brand-new-feature",
    "/brand-new-feature",
  ]);
});

test("registry completeness — no registered page or API route is missing from disk", () => {
  const discovered = new Set(DISCOVERED.map((route) => route.pattern));
  const phantom = PLATFORM_ROUTES.filter(
    (route) =>
      (route.surface === "PAGE" || route.surface === "API") &&
      route.access.kind !== "REDIRECT_ONLY" &&
      !discovered.has(normalizeRoutePattern(route.pattern)),
  ).map((route) => route.pattern);

  assert.deepEqual(phantom, [], "registry entries with no matching file in src/app");
});

test("registry completeness — surfaces agree with what is on disk", () => {
  const bySurface = new Map(DISCOVERED.map((route) => [route.pattern, route.surface]));
  for (const route of PLATFORM_ROUTES) {
    const onDisk = bySurface.get(normalizeRoutePattern(route.pattern));
    if (!onDisk) continue;
    assert.equal(route.surface, onDisk, `${route.pattern} surface`);
  }
});

test("registry completeness — redirect-only routes have no page of their own", () => {
  const discovered = new Set(DISCOVERED.map((route) => route.pattern));
  const redirects = PLATFORM_ROUTES.filter((route) => route.access.kind === "REDIRECT_ONLY");
  assert.ok(redirects.length > 0, "expected at least one registered redirect route");
  for (const route of redirects) {
    assert.equal(
      discovered.has(normalizeRoutePattern(route.pattern)),
      false,
      `${route.pattern} is redirect-only but a page exists for it`,
    );
  }
});

test("registry completeness — /evs is absent from the app and from the registry", () => {
  const onDisk = DISCOVERED.filter((route) => route.pattern.startsWith("/evs"));
  assert.deepEqual(onDisk, [], "/evs was deferred and must not exist in src/app");

  const registered = PLATFORM_ROUTES.filter((route) => route.pattern.startsWith("/evs"));
  assert.deepEqual(registered, [], "/evs must not be classified in the platform registry");
});

test("registry integrity — patterns are unique, normalized, and use a known access kind", () => {
  const seen = new Set<string>();
  for (const route of PLATFORM_ROUTES) {
    assert.equal(
      route.pattern,
      normalizeRoutePattern(route.pattern),
      `${route.pattern} should be stored normalized`,
    );
    assert.equal(seen.has(route.pattern), false, `duplicate registry pattern ${route.pattern}`);
    seen.add(route.pattern);
    assert.ok(
      ROUTE_ACCESS_KINDS.includes(route.access.kind),
      `${route.pattern} has an unknown access kind`,
    );
    assert.ok(route.module.length > 0, `${route.pattern} must declare an owning module`);
  }
});

test("registry integrity — role-restricted routes approve at least one role", () => {
  for (const route of PLATFORM_ROUTES) {
    if (route.access.kind !== "ROLE_RESTRICTED") continue;
    assert.ok(
      route.access.allowedRoles.length > 0,
      `${route.pattern} is role-restricted with no approved role`,
    );
  }
});

test("registry integrity — every API route is explicitly classified", () => {
  const apiRoutes = PLATFORM_ROUTES.filter((route) => route.surface === "API");
  const discoveredApis = DISCOVERED.filter((route) => route.surface === "API");
  assert.equal(apiRoutes.length, discoveredApis.length);

  for (const route of apiRoutes) {
    assert.ok(
      ["PUBLIC", "HANDLER_AUTHORIZED_API", "ROLE_RESTRICTED"].includes(route.access.kind),
      `${route.pattern} uses ${route.access.kind}, which is not a valid API classification`,
    );
    if (route.access.kind !== "PUBLIC") {
      assert.equal(
        route.requiresDownstreamAuthorization,
        true,
        `${route.pattern} must keep handler-level authorization`,
      );
    }
  }
});
