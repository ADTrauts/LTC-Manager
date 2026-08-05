import type { AppRole } from "@/lib/access";
import { isApiPathname, matchPlatformRoute } from "@/lib/route-registry/match";
import type { PlatformRoute, RouteSurface } from "@/lib/route-registry/types";

export type RouteAuthorizationInput = {
  pathname: string;
  /** The caller's role, or `null` when there is no valid session. */
  role: AppRole | null;
  featureFlags: { todaysWorkEnabled: boolean };
};

export type RouteAuthorizationDecision =
  /** Continue to the route. */
  | { outcome: "ALLOW"; route: PlatformRoute }
  /** Registered, but no session. Pages go to sign-in; APIs get 401. */
  | { outcome: "REQUIRE_AUTHENTICATION"; route: PlatformRoute; surface: RouteSurface }
  /** Registered and authenticated, but this role is not approved. Pages go home; APIs get 403. */
  | { outcome: "DENY"; route: PlatformRoute; surface: RouteSurface; reason: DenyReason }
  /**
   * Registered redirect. `destination` is `null` when the caller should land on their own default
   * home rather than a fixed path.
   */
  | { outcome: "REDIRECT"; route: PlatformRoute; destination: string | null }
  /** Not in the registry at all. */
  | { outcome: "NOT_FOUND"; surface: RouteSurface };

export type DenyReason = "ROLE_NOT_APPROVED" | "FEATURE_DISABLED";

function unregisteredSurface(pathname: string): RouteSurface {
  return isApiPathname(pathname) ? "API" : "PAGE";
}

function featureEnabled(route: PlatformRoute, flags: RouteAuthorizationInput["featureFlags"]): boolean {
  if (route.featureFlag === "TODAYS_WORK") return flags.todaysWorkEnabled;
  return true;
}

/**
 * The single authorization decision for a request path.
 *
 * This is a pure function of the platform registry, the caller's role, and feature-flag state. It
 * reads no database, so a drifted, emptied, or maliciously edited legacy permission table cannot
 * change its answer. There is no allow-by-default branch: a path that matches no registry entry is
 * Not Found.
 *
 * The decision is the *first* gate, never the only one. Page guards, layout guards, API handler role
 * checks, Facility and Department scope, and object ownership all still apply downstream.
 */
export function authorizeRoute(input: RouteAuthorizationInput): RouteAuthorizationDecision {
  const route = matchPlatformRoute(input.pathname);
  if (!route) {
    return { outcome: "NOT_FOUND", surface: unregisteredSurface(input.pathname) };
  }

  if (route.access.kind === "INTERNAL" || route.access.kind === "PUBLIC") {
    return { outcome: "ALLOW", route };
  }

  if (!input.role) {
    return { outcome: "REQUIRE_AUTHENTICATION", route, surface: route.surface };
  }

  if (!featureEnabled(route, input.featureFlags)) {
    return route.surface === "API"
      ? { outcome: "DENY", route, surface: "API", reason: "FEATURE_DISABLED" }
      : { outcome: "REDIRECT", route, destination: null };
  }

  switch (route.access.kind) {
    case "AUTHENTICATED":
    case "HANDLER_AUTHORIZED_API":
      return { outcome: "ALLOW", route };

    case "ROLE_RESTRICTED":
      return route.access.allowedRoles.includes(input.role)
        ? { outcome: "ALLOW", route }
        : { outcome: "DENY", route, surface: route.surface, reason: "ROLE_NOT_APPROVED" };

    case "REDIRECT_ONLY":
      return {
        outcome: "REDIRECT",
        route,
        destination: route.access.allowedRoles.includes(input.role) ? route.access.destination : null,
      };
  }
}

/**
 * Whether `role` may reach `pathname` at all. Used by navigation and the Access Matrix so both
 * describe exactly what the proxy will do.
 */
export function roleMayAccessRoute(
  pathname: string,
  role: AppRole,
  featureFlags: RouteAuthorizationInput["featureFlags"],
): boolean {
  const decision = authorizeRoute({ pathname, role, featureFlags });
  return decision.outcome === "ALLOW";
}
