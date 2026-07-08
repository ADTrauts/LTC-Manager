import type { RoleKey } from "@prisma/client";

import { APP_ROLES, type AppRole, ROLE_PRIORITY } from "@/lib/access";
import { type NavRouteItem, resolveZoneForPathPrefix } from "@/lib/nav-zones";
import { prisma } from "@/lib/prisma";

export type { NavRouteItem };

export type RoutePermissionRule = {
  pathPrefix: string;
  allowedRoleKeys: Set<RoleKey>;
};

/** Seeded fallback min-role map — keep aligned with prisma/seed.mjs ROUTE_MIN_ROLE. */
export const WAVE1_ROUTE_MIN_ROLES: Record<string, AppRole> = {
  "/admin": "FACILITY_ADMINISTRATOR",
  "/employees": "MANAGER",
  "/reports": "MANAGER",
  "/units": "SUPERVISOR",
  "/staffing": "SUPERVISOR",
  "/menus": "SUPERVISOR",
  "/assets": "SUPERVISOR",
  "/logs": "STAFF",
  "/evs": "STAFF",
  "/repairs": "STAFF",
  "/unit": "STAFF",
  "/dashboard": "STAFF",
  "/operations": "STAFF",
  "/today": "SUPERVISOR",
};

const CACHE_TTL_MS = 30_000;

function toNavRouteItem(label: string, href: string): NavRouteItem {
  return { label, href, zone: resolveZoneForPathPrefix(href) };
}

let cache:
  | {
      rules: RoutePermissionRule[];
      navItemsByRole: Record<AppRole, NavRouteItem[]>;
      expiresAt: number;
    }
  | null = null;

const FALLBACK_RULES: { pathPrefix: string; minRole: AppRole }[] = Object.entries(
  WAVE1_ROUTE_MIN_ROLES,
).map(([pathPrefix, minRole]) => ({ pathPrefix, minRole }));

function includePath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolveRouteAccess(
  pathname: string,
  role: AppRole,
  rules: RoutePermissionRule[],
): boolean {
  for (const rule of rules) {
    if (includePath(pathname, rule.pathPrefix)) {
      return rule.allowedRoleKeys.has(role as RoleKey);
    }
  }
  if (pathname === "/") {
    return true;
  }
  return true;
}

function buildFallbackRules(): RoutePermissionRule[] {
  return FALLBACK_RULES.map((rule) => {
    const allowedRoleKeys = new Set<RoleKey>(
      APP_ROLES.filter((r) => ROLE_PRIORITY[r] >= ROLE_PRIORITY[rule.minRole]) as RoleKey[],
    );
    return { pathPrefix: rule.pathPrefix, allowedRoleKeys };
  }).sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);
}

function emptyNavByRole(): Record<AppRole, NavRouteItem[]> {
  return APP_ROLES.reduce(
    (acc, r) => {
      acc[r] = [];
      return acc;
    },
    {} as Record<AppRole, NavRouteItem[]>,
  );
}

async function loadPermissionConfig() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache;

  const rows = await prisma.roleRoutePermission.findMany({
    where: {
      role: { isActive: true },
      appRoute: { isActive: true },
    },
    select: {
      allowed: true,
      role: { select: { key: true } },
      appRoute: {
        select: {
          pathPrefix: true,
          label: true,
          navVisible: true,
          navOrder: true,
        },
      },
    },
  });

  if (rows.length === 0) {
    const fallbackRules = buildFallbackRules();
    const fallbackNavByRole = emptyNavByRole();
    const fallbackNavDefs = [
      { label: "Operations Center", href: "/dashboard", minRole: "STAFF" as AppRole },
      { label: "Locations", href: "/units", minRole: "SUPERVISOR" as AppRole },
      { label: "Employees", href: "/employees", minRole: "MANAGER" as AppRole },
      { label: "Logs", href: "/logs", minRole: "STAFF" as AppRole },
      { label: "Staffing", href: "/staffing", minRole: "SUPERVISOR" as AppRole },
      { label: "Menus", href: "/menus", minRole: "SUPERVISOR" as AppRole },
      { label: "Assets", href: "/assets", minRole: "SUPERVISOR" as AppRole },
      { label: "Repairs", href: "/repairs", minRole: "STAFF" as AppRole },
      { label: "Review", href: "/reports", minRole: "MANAGER" as AppRole },
      { label: "Administration", href: "/admin", minRole: "FACILITY_ADMINISTRATOR" as AppRole },
    ];
    for (const role of APP_ROLES) {
      fallbackNavByRole[role] = fallbackNavDefs
        .filter((item) => ROLE_PRIORITY[role] >= ROLE_PRIORITY[item.minRole])
        .map((item) => toNavRouteItem(item.label, item.href));
    }
    cache = {
      rules: fallbackRules,
      navItemsByRole: fallbackNavByRole,
      expiresAt: now + CACHE_TTL_MS,
    };
    return cache;
  }

  const routeMap = new Map<
    string,
    { pathPrefix: string; label: string; navVisible: boolean; navOrder: number; allowedRoleKeys: Set<RoleKey> }
  >();
  for (const row of rows) {
    const key = row.appRoute.pathPrefix;
    const existing = routeMap.get(key) ?? {
      pathPrefix: row.appRoute.pathPrefix,
      label: row.appRoute.label,
      navVisible: row.appRoute.navVisible,
      navOrder: row.appRoute.navOrder,
      allowedRoleKeys: new Set<RoleKey>(),
    };
    if (row.allowed) {
      existing.allowedRoleKeys.add(row.role.key);
    }
    routeMap.set(key, existing);
  }

  const rules = [...routeMap.values()]
    .map((item) => ({
      pathPrefix: item.pathPrefix,
      allowedRoleKeys: item.allowedRoleKeys,
    }))
    .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);

  const navItemsByRole = emptyNavByRole();

  const navRouteDefs = [...routeMap.values()]
    .filter((item) => item.navVisible)
    .sort((a, b) => a.navOrder - b.navOrder || a.pathPrefix.localeCompare(b.pathPrefix));

  for (const role of APP_ROLES) {
    navItemsByRole[role] = navRouteDefs
      .filter((item) => item.allowedRoleKeys.has(role as RoleKey))
      .map((item) => toNavRouteItem(item.label, item.pathPrefix));
  }

  cache = {
    rules,
    navItemsByRole,
    expiresAt: now + CACHE_TTL_MS,
  };
  return cache;
}

export async function canAccessRouteByRole(pathname: string, role: AppRole): Promise<boolean> {
  const config = await loadPermissionConfig();
  return resolveRouteAccess(pathname, role, config.rules);
}

export async function getNavItemsForRole(role: AppRole): Promise<NavRouteItem[]> {
  const config = await loadPermissionConfig();
  return config.navItemsByRole[role] ?? [];
}

export function clearRoutePermissionCache() {
  cache = null;
}
