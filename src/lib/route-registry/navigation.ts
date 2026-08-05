import type { AppRole } from "@/lib/access";
import {
  normalizePrimaryNavLabel,
  resolveZoneForPathPrefix,
  type NavRouteItem,
} from "@/lib/nav-zones";
import { roleMayAccessRoute } from "@/lib/route-registry/authorize";
import { PLATFORM_ROUTES } from "@/lib/route-registry/platform-routes";
import type { RouteAuthorizationInput } from "@/lib/route-registry/authorize";

export type NavFeatureFlags = RouteAuthorizationInput["featureFlags"];

/**
 * Primary navigation for a role, projected from the platform registry.
 *
 * Every item is re-checked through `roleMayAccessRoute`, the same decision the proxy makes, so a
 * link can never be offered for a route the role would be denied. The reverse does not hold and is
 * intentional: a registered route with no `nav` entry stays reachable by URL for the roles that are
 * approved for it. Navigation is a convenience projection, not the authorization boundary.
 */
export function platformNavItemsForRole(role: AppRole, featureFlags: NavFeatureFlags): NavRouteItem[] {
  return PLATFORM_ROUTES.filter((route) => route.nav !== undefined)
    .filter((route) => roleMayAccessRoute(route.pattern, role, featureFlags))
    .sort((a, b) => {
      const orderDelta = (a.nav?.order ?? 0) - (b.nav?.order ?? 0);
      return orderDelta !== 0 ? orderDelta : a.pattern.localeCompare(b.pattern);
    })
    .map((route) => ({
      label: normalizePrimaryNavLabel(route.pattern, route.nav?.label ?? route.pattern),
      href: route.pattern,
      zone: resolveZoneForPathPrefix(route.pattern),
    }));
}
