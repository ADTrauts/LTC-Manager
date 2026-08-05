export { PLATFORM_ROUTES } from "@/lib/route-registry/platform-routes";
export {
  isApiPathname,
  matchPlatformRoute,
  normalizeRoutePattern,
} from "@/lib/route-registry/match";
export {
  authorizeRoute,
  roleMayAccessRoute,
  type DenyReason,
  type RouteAuthorizationDecision,
  type RouteAuthorizationInput,
} from "@/lib/route-registry/authorize";
export { platformNavItemsForRole, type NavFeatureFlags } from "@/lib/route-registry/navigation";
export {
  buildAccessMatrix,
  type AccessMatrixGroup,
  type AccessMatrixRow,
} from "@/lib/route-registry/access-matrix";
export {
  buildLegacyRouteMirror,
  type LegacyMirrorRoute,
  type LegacyRouteMirror,
} from "@/lib/route-registry/legacy-mirror";
export {
  rolesAtLeast,
  ROUTE_ACCESS_KINDS,
  type PlatformRoute,
  type RouteAccess,
  type RouteAccessKind,
  type RouteFeatureFlag,
  type RouteMatchMode,
  type RouteSurface,
} from "@/lib/route-registry/types";
