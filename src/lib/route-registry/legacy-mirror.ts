import { APP_ROLES, type AppRole } from "@/lib/access";
import { PLATFORM_ROUTES } from "@/lib/route-registry/platform-routes";
import type { PlatformRoute } from "@/lib/route-registry/types";

/**
 * Shape written to `prisma/legacy-route-mirror.json` and consumed by `prisma/seed.mjs`.
 *
 * The `AppRoute` and `RoleRoutePermission` tables are non-authoritative compatibility data: nothing
 * at runtime reads them. Seed still populates them so historical tooling and migration continuity
 * keep working, and this generator is the only thing that decides what goes in, so the tables cannot
 * express a policy the registry does not.
 */
export type LegacyMirrorRoute = {
  key: string;
  pathPrefix: string;
  label: string;
  navVisible: boolean;
  navOrder: number;
  isCritical: boolean;
  allowedRoles: AppRole[];
};

export type LegacyRouteMirror = {
  generatedFrom: string;
  note: string;
  routes: LegacyMirrorRoute[];
};

const GENERATED_FROM = "src/lib/route-registry/platform-routes.ts";

const MIRROR_NOTE =
  "Non-authoritative compatibility data. Runtime authorization never reads AppRoute or " +
  "RoleRoutePermission; regenerate with the route-registry legacy mirror test.";

/** Product area a route belongs to, keyed by its first path segment. */
function areaKeyFor(route: PlatformRoute): string | null {
  const segments = route.pattern.split("/").filter(Boolean);
  return segments[0] ?? null;
}

function allowedRolesFor(route: PlatformRoute): readonly AppRole[] | null {
  return route.access.kind === "ROLE_RESTRICTED" ? route.access.allowedRoles : null;
}

/**
 * Build the legacy mirror from the registry.
 *
 * One mirror row per product area anchored by a `legacyArea` entry. The area's role set is the
 * intersection of every role-restricted route inside it, so the mirror can only ever be as
 * permissive as the strictest real route it stands for.
 */
export function buildLegacyRouteMirror(): LegacyRouteMirror {
  const anchors = PLATFORM_ROUTES.filter((route) => route.legacyArea !== undefined);

  const routes: LegacyMirrorRoute[] = anchors.map((anchor) => {
    const area = anchor.legacyArea as NonNullable<PlatformRoute["legacyArea"]>;
    const anchorArea = areaKeyFor(anchor);

    const memberRoleSets = PLATFORM_ROUTES.filter(
      (route) => route.surface === "PAGE" && areaKeyFor(route) === anchorArea,
    )
      .map(allowedRolesFor)
      .filter((roles): roles is readonly AppRole[] => roles !== null);

    const allowedRoles = APP_ROLES.filter((role) =>
      memberRoleSets.every((roles) => roles.includes(role)),
    );

    return {
      key: area.key,
      pathPrefix: anchorArea === null ? "/" : `/${anchorArea}`,
      label: area.label,
      navVisible: area.navVisible,
      navOrder: area.navOrder,
      isCritical: area.critical,
      allowedRoles: [...allowedRoles],
    };
  });

  routes.sort((a, b) => a.pathPrefix.localeCompare(b.pathPrefix));

  return { generatedFrom: GENERATED_FROM, note: MIRROR_NOTE, routes };
}
