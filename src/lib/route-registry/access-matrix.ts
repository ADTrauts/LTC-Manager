import { APP_ROLES, type AppRole } from "@/lib/access";
import { authorizeRoute } from "@/lib/route-registry/authorize";
import { PLATFORM_ROUTES } from "@/lib/route-registry/platform-routes";
import type { NavFeatureFlags } from "@/lib/route-registry/navigation";
import type { RouteAccessKind } from "@/lib/route-registry/types";

/**
 * Whether a role gets anywhere useful at this path. A redirect route counts as reachable only when
 * the role lands on the route's own destination rather than being bounced to its default home.
 */
function roleReachesRoute(pattern: string, role: AppRole, featureFlags: NavFeatureFlags): boolean {
  const decision = authorizeRoute({ pathname: pattern, role, featureFlags });
  if (decision.outcome === "ALLOW") return true;
  return decision.outcome === "REDIRECT" && decision.destination !== null;
}

export type AccessMatrixRow = {
  pattern: string;
  module: string;
  classification: RouteAccessKind;
  /** Whether each platform role reaches this route, computed with the proxy's own decision. */
  allowedByRole: Record<AppRole, boolean>;
  navLabel: string | null;
  featureFlag: string | null;
  requiresDownstreamAuthorization: boolean;
  notes: string | null;
};

export type AccessMatrixGroup = {
  module: string;
  rows: AccessMatrixRow[];
};

function buildRows(surface: "PAGE" | "API", featureFlags: NavFeatureFlags): AccessMatrixRow[] {
  return PLATFORM_ROUTES.filter((route) => route.surface === surface).map((route) => ({
    pattern: route.pattern,
    module: route.module,
    classification: route.access.kind,
    allowedByRole: Object.fromEntries(
      APP_ROLES.map((role) => [role, roleReachesRoute(route.pattern, role, featureFlags)]),
    ) as Record<AppRole, boolean>,
    navLabel: route.nav?.label ?? null,
    featureFlag: route.featureFlag ?? null,
    requiresDownstreamAuthorization: route.requiresDownstreamAuthorization === true,
    notes: route.notes ?? null,
  }));
}

function groupByModule(rows: AccessMatrixRow[]): AccessMatrixGroup[] {
  const byModule = new Map<string, AccessMatrixRow[]>();
  for (const row of rows) {
    const existing = byModule.get(row.module) ?? [];
    existing.push(row);
    byModule.set(row.module, existing);
  }
  return [...byModule.entries()]
    .map(([module, moduleRows]) => ({
      module,
      rows: moduleRows.sort((a, b) => a.pattern.localeCompare(b.pattern)),
    }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

/**
 * Read-only view model for the Access Matrix screen.
 *
 * Every cell is produced by asking the real authorization function, so the screen reports what the
 * proxy will actually do rather than a separately maintained description of it. Nothing here is
 * writable; the registry is source, not state.
 */
export function buildAccessMatrix(featureFlags: NavFeatureFlags): {
  pageGroups: AccessMatrixGroup[];
  apiGroups: AccessMatrixGroup[];
  roles: readonly AppRole[];
} {
  return {
    pageGroups: groupByModule(buildRows("PAGE", featureFlags)),
    apiGroups: groupByModule(buildRows("API", featureFlags)),
    roles: APP_ROLES,
  };
}
