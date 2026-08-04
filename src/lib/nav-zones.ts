import { hasAtLeastRole, type AppRole } from "@/lib/access";
import type { AuthKind } from "@/lib/auth";
import { isTodaysWorkEnabled } from "@/lib/feature-flags";

export const NAV_ZONES = [
  "WORKSPACE",
  "OPERATIONS_CENTER",
  "LOCATIONS",
  "TODAYS_WORK",
  "REVIEW",
  "ADMINISTRATION",
] as const;

export type NavZone = (typeof NAV_ZONES)[number];

export const NAV_ZONE_LABELS: Record<NavZone, string> = {
  WORKSPACE: "Workspace",
  OPERATIONS_CENTER: "Operations Center",
  LOCATIONS: "Locations",
  TODAYS_WORK: "Today's Work",
  REVIEW: "Review",
  ADMINISTRATION: "Administration",
};

/** Canonical visible labels for primary top-nav routes (pathPrefix → zone-facing label). */
export const PRIMARY_NAV_LABELS: Record<string, string> = {
  "/workspace": NAV_ZONE_LABELS.WORKSPACE,
  "/dashboard": NAV_ZONE_LABELS.OPERATIONS_CENTER,
  "/today": NAV_ZONE_LABELS.TODAYS_WORK,
  "/staffing": NAV_ZONE_LABELS.TODAYS_WORK,
  "/reports": NAV_ZONE_LABELS.REVIEW,
  "/units": NAV_ZONE_LABELS.LOCATIONS,
  "/admin": NAV_ZONE_LABELS.ADMINISTRATION,
};

export function normalizePrimaryNavLabel(pathPrefix: string, label: string): string {
  return PRIMARY_NAV_LABELS[pathPrefix] ?? label;
}

export const NAV_ZONE_ORDER: NavZone[] = [...NAV_ZONES];

type NavZonePathRule = { pathPrefix: string; zone: NavZone };

/**
 * Longest matching pathPrefix wins. Aligns with product-reference zone IA and
 * codebase route inventory (02_CODEBASE_MAPPING).
 */
export const NAV_ZONE_PATH_RULES: NavZonePathRule[] = (
  [
    { pathPrefix: "/workspace", zone: "WORKSPACE" },
    { pathPrefix: "/dashboard", zone: "OPERATIONS_CENTER" },
    { pathPrefix: "/operations", zone: "OPERATIONS_CENTER" },
    { pathPrefix: "/unit", zone: "LOCATIONS" },
    { pathPrefix: "/units", zone: "LOCATIONS" },
    { pathPrefix: "/today", zone: "TODAYS_WORK" },
    { pathPrefix: "/staffing", zone: "TODAYS_WORK" },
    { pathPrefix: "/reports", zone: "REVIEW" },
    { pathPrefix: "/admin", zone: "ADMINISTRATION" },
    { pathPrefix: "/employees", zone: "ADMINISTRATION" },
    { pathPrefix: "/logs", zone: "ADMINISTRATION" },
    { pathPrefix: "/menus", zone: "ADMINISTRATION" },
    { pathPrefix: "/assets", zone: "ADMINISTRATION" },
    { pathPrefix: "/repairs", zone: "ADMINISTRATION" },
    { pathPrefix: "/issues", zone: "ADMINISTRATION" },
    { pathPrefix: "/department", zone: "ADMINISTRATION" },
  ] satisfies NavZonePathRule[]
).sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);

const DEFAULT_NAV_ZONE: NavZone = "ADMINISTRATION";

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === "/") return "/";
  const withoutQuery = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  return withoutQuery.endsWith("/") && withoutQuery.length > 1
    ? withoutQuery.slice(0, -1)
    : withoutQuery;
}

export function resolveZoneForPathname(pathname: string): NavZone {
  const normalized = normalizePathname(pathname);
  for (const rule of NAV_ZONE_PATH_RULES) {
    if (normalized === rule.pathPrefix || normalized.startsWith(`${rule.pathPrefix}/`)) {
      return rule.zone;
    }
  }
  return DEFAULT_NAV_ZONE;
}

export function resolveZoneForPathPrefix(pathPrefix: string): NavZone {
  return resolveZoneForPathname(pathPrefix);
}

export function isTodaysWorkPathname(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return normalized === "/today" || normalized.startsWith("/today/");
}

export type NavRouteItem = {
  label: string;
  href: string;
  zone: NavZone;
};

export type NavZoneGroup = {
  zone: NavZone;
  label: string;
  items: { label: string; href: string }[];
};

export function groupNavItemsByZone(items: NavRouteItem[]): NavZoneGroup[] {
  const byZone = new Map<NavZone, NavRouteItem[]>();
  for (const item of items) {
    const list = byZone.get(item.zone) ?? [];
    list.push(item);
    byZone.set(item.zone, list);
  }

  return NAV_ZONE_ORDER.filter((zone) => byZone.has(zone)).map((zone) => ({
    zone,
    label: NAV_ZONE_LABELS[zone],
    items: (byZone.get(zone) ?? []).map(({ label, href }) => ({
      label: normalizePrimaryNavLabel(href, label),
      href,
    })),
  }));
}

/** Hide redundant zone micro-label when a zone has a single link matching the zone name. */
export function shouldShowZoneHeading(group: NavZoneGroup): boolean {
  if (group.items.length !== 1) {
    return true;
  }
  const itemLabel = group.items[0]?.label.trim().toLowerCase() ?? "";
  const zoneLabel = group.label.trim().toLowerCase();
  return itemLabel !== zoneLabel;
}

export type DefaultHomeContext = {
  authKind: AuthKind;
  role: AppRole;
  activeUnitId?: string | null;
  /** Kiosk-bound unit when employee session is locked to the device unit. */
  lockedUnitId?: string;
};

function isFloorOperationalContext(ctx: DefaultHomeContext): boolean {
  if (ctx.authKind === "employee") return true;
  return ctx.role === "STAFF" || ctx.role === "LEAD_TEAM_MEMBER";
}

/**
 * Role-aware post-auth landing path.
 * Manager+ → Business Workspace; Supervisor → Today's Work; floor → unit/logs.
 */
export function resolveDefaultHomePath(ctx: DefaultHomeContext): string {
  const unitId = ctx.lockedUnitId ?? ctx.activeUnitId ?? undefined;

  if (isFloorOperationalContext(ctx)) {
    if (unitId) {
      return `/unit/${unitId}`;
    }
    // Floor roles cannot access /units (supervisor+); use an entitled module to avoid proxy loops.
    return "/logs";
  }

  if (ctx.role === "SUPERVISOR") {
    return isTodaysWorkEnabled() ? "/today" : "/workspace";
  }

  if (hasAtLeastRole(ctx.role, "MANAGER")) {
    return "/workspace";
  }

  return "/workspace";
}
