import { PLATFORM_ROUTES } from "@/lib/route-registry/platform-routes";
import type { PlatformRoute } from "@/lib/route-registry/types";

/**
 * Strip query and hash, collapse a trailing slash, and split into segments.
 *
 * Matching is segment-based rather than string-prefix based so a registered pattern can never
 * capture an unrelated sibling: `/unit/[unitId]` cannot match `/units`, and `/admin` cannot match
 * `/administration`.
 */
function toSegments(pathname: string): string[] {
  const raw = pathname.trim();
  const withoutQuery = raw.split("?")[0]?.split("#")[0] ?? raw;
  return withoutQuery.split("/").filter((segment) => segment.length > 0);
}

function isDynamicSegment(segment: string): boolean {
  return segment.startsWith("[") && segment.endsWith("]");
}

function isCatchAllSegment(segment: string): boolean {
  return segment.startsWith("[...") && segment.endsWith("]");
}

type CompiledRoute = {
  route: PlatformRoute;
  segments: string[];
  /** Ranking inputs: more segments wins, then more literal segments, then EXACT over PREFIX. */
  literalCount: number;
  hasCatchAll: boolean;
};

function compile(route: PlatformRoute): CompiledRoute {
  const segments = toSegments(route.pattern);
  return {
    route,
    segments,
    literalCount: segments.filter((segment) => !isDynamicSegment(segment)).length,
    hasCatchAll: segments.some(isCatchAllSegment),
  };
}

/**
 * Compiled once and ordered most-specific first, so the first match is the longest-specific match.
 * A deeper pattern beats a shallower one; at equal depth a literal-heavier pattern beats a
 * dynamic one; at equal specificity `EXACT` beats `PREFIX`.
 */
const COMPILED_ROUTES: readonly CompiledRoute[] = PLATFORM_ROUTES.map(compile).sort((a, b) => {
  if (a.segments.length !== b.segments.length) return b.segments.length - a.segments.length;
  if (a.literalCount !== b.literalCount) return b.literalCount - a.literalCount;
  if (a.route.match !== b.route.match) return a.route.match === "EXACT" ? -1 : 1;
  return a.route.pattern.localeCompare(b.route.pattern);
});

function segmentsMatch(compiled: CompiledRoute, path: string[]): boolean {
  const { segments, route } = compiled;

  for (let i = 0; i < segments.length; i += 1) {
    const pattern = segments[i] as string;

    if (isCatchAllSegment(pattern)) {
      // A catch-all consumes the remainder and requires at least one segment to consume.
      return path.length > i;
    }

    const actual = path[i];
    if (actual === undefined) return false;
    if (isDynamicSegment(pattern)) continue;
    if (pattern !== actual) return false;
  }

  return route.match === "PREFIX" ? path.length >= segments.length : path.length === segments.length;
}

/** The registered route governing `pathname`, or `null` when the path is unregistered. */
export function matchPlatformRoute(pathname: string): PlatformRoute | null {
  const path = toSegments(pathname);
  for (const compiled of COMPILED_ROUTES) {
    if (segmentsMatch(compiled, path)) {
      return compiled.route;
    }
  }
  return null;
}

/** True when the path looks like an API call, used to pick an API-shaped denial for unknown paths. */
export function isApiPathname(pathname: string): boolean {
  const path = toSegments(pathname);
  return path[0] === "api";
}

/** Normalized form used when comparing registry patterns to on-disk routes. */
export function normalizeRoutePattern(pattern: string): string {
  const segments = toSegments(pattern);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}
