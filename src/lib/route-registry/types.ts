import { APP_ROLES, ROLE_PRIORITY, type AppRole } from "@/lib/access";

/**
 * Authentication classes for a platform route.
 *
 * These are the only ways a route may be reached. There is deliberately no "unclassified" state:
 * a path that matches no entry is not allowed, it is Not Found (see `authorize.ts`).
 */
export const ROUTE_ACCESS_KINDS = [
  /** Reachable without a session. */
  "PUBLIC",
  /** Any authenticated supported role, subject to page/handler/scope/object authorization. */
  "AUTHENTICATED",
  /** Only the explicitly listed roles. */
  "ROLE_RESTRICTED",
  /** Session required at the proxy; the handler remains responsible for role and object checks. */
  "HANDLER_AUTHORIZED_API",
  /** Registered path that only redirects; it renders nothing of its own. */
  "REDIRECT_ONLY",
  /** Framework or static asset path that the proxy passes through untouched. */
  "INTERNAL",
] as const;

export type RouteAccessKind = (typeof ROUTE_ACCESS_KINDS)[number];

export type RouteAccess =
  | { kind: "PUBLIC" }
  | { kind: "AUTHENTICATED" }
  | { kind: "ROLE_RESTRICTED"; allowedRoles: readonly AppRole[] }
  | { kind: "HANDLER_AUTHORIZED_API" }
  | {
      kind: "REDIRECT_ONLY";
      destination: string;
      /** Roles sent to `destination`; any other authenticated role goes to its default home. */
      allowedRoles: readonly AppRole[];
    }
  | { kind: "INTERNAL" };

/**
 * Feature flags that can withdraw a whole route, independent of role.
 *
 * `TODAYS_WORK` is enforced at the proxy (the route redirects/denies when off). The department
 * operational flags are used by the navigation projection so a Build/Run link disappears when the
 * capability is off; the pages themselves keep their own downstream flag guards, so leaving a flag
 * unset in a caller's `featureFlags` (treated as enabled) never exposes a disabled page — it only
 * keeps that page's own guard as the gate.
 */
export type RouteFeatureFlag =
  | "TODAYS_WORK"
  | "DIETARY_OPERATIONAL_EVIDENCE"
  | "DIETARY_WORK_PLANS";

export type RouteSurface = "PAGE" | "API" | "INTERNAL";

/**
 * `EXACT` compares the full segment list. `PREFIX` matches the pattern plus any deeper segments.
 * Every real page and API route is registered `EXACT`, so a path that is one segment off is Not
 * Found rather than inheriting a parent's policy.
 */
export type RouteMatchMode = "EXACT" | "PREFIX";

export type RouteNavMetadata = {
  /** Label rendered in primary navigation. */
  label: string;
  /** Ascending sort key within navigation. */
  order: number;
};

/**
 * Display metadata for the legacy `AppRoute` compatibility mirror, carried on the shallowest route
 * of a product area.
 *
 * This is presentation data for non-authoritative rows only. The roles written into the mirror are
 * always derived from the registry's own `access`, never from anything declared here, so the mirror
 * cannot express a policy that the registry does not.
 */
export type LegacyAreaMetadata = {
  /** `AppRoute.key` — stable across reseeds. */
  key: string;
  label: string;
  navOrder: number;
  navVisible: boolean;
  critical: boolean;
};

export type PlatformRoute = {
  /**
   * Next.js-style pattern. `[param]` matches exactly one segment; `[...param]` matches one or more.
   * For page and API routes this is the on-disk `src/app` path with route groups removed.
   */
  pattern: string;
  match: RouteMatchMode;
  surface: RouteSurface;
  access: RouteAccess;
  /** Owning product module, used for grouping in the Access Matrix and for review ownership. */
  module: string;
  featureFlag?: RouteFeatureFlag;
  /** Present only when the route appears in primary navigation. */
  nav?: RouteNavMetadata;
  /** Present on the anchor route of a product area that the legacy compatibility mirror represents. */
  legacyArea?: LegacyAreaMetadata;
  /**
   * True when authorization beyond the proxy decision is mandatory — handler role checks, page
   * guards, Facility/Department scope, or object ownership. The proxy is never the only gate for
   * these; it is the first one.
   */
  requiresDownstreamAuthorization?: boolean;
  /** Short note on what that downstream authorization is, for reviewers and the Access Matrix. */
  notes?: string;
};

/**
 * Roles at or above `min` in the platform hierarchy.
 *
 * Registry entries store the resulting list explicitly so the policy reads as a set of approved
 * roles rather than as an inequality, while the hierarchy stays defined in exactly one place.
 */
export function rolesAtLeast(min: AppRole): readonly AppRole[] {
  return APP_ROLES.filter((role) => ROLE_PRIORITY[role] >= ROLE_PRIORITY[min]);
}

export const ALL_APP_ROLES: readonly AppRole[] = APP_ROLES;
