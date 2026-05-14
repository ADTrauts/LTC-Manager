import type { RoleKey } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { AppRole } from "@/lib/access";

export type RoutePermissionRule = {
  pathPrefix: string;
  allowedRoleKeys: Set<RoleKey>;
};

export type NavRouteItem = {
  label: string;
  href: string;
};

const CACHE_TTL_MS = 30_000;

let cache:
  | {
      rules: RoutePermissionRule[];
      navItemsByRole: Record<AppRole, NavRouteItem[]>;
      expiresAt: number;
    }
  | null = null;

const FALLBACK_RULES: { pathPrefix: string; minRole: AppRole }[] = [
  { pathPrefix: "/admin", minRole: "GM" },
  { pathPrefix: "/employees", minRole: "MANAGER" },
  { pathPrefix: "/reports", minRole: "MANAGER" },
  { pathPrefix: "/units", minRole: "SUPERVISOR" },
  { pathPrefix: "/staffing", minRole: "SUPERVISOR" },
  { pathPrefix: "/menus", minRole: "SUPERVISOR" },
  { pathPrefix: "/assets", minRole: "SUPERVISOR" },
  { pathPrefix: "/logs", minRole: "STAFF" },
  { pathPrefix: "/repairs", minRole: "STAFF" },
  { pathPrefix: "/unit", minRole: "STAFF" },
  { pathPrefix: "/dashboard", minRole: "STAFF" },
];

const ROLE_PRIORITY: Record<AppRole, number> = {
  GM: 5,
  MANAGER: 4,
  SUPERVISOR: 3,
  LEAD_TEAM_MEMBER: 2,
  STAFF: 1,
};

const ALL_APP_ROLES: AppRole[] = ["GM", "MANAGER", "SUPERVISOR", "LEAD_TEAM_MEMBER", "STAFF"];

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
      return rule.allowedRoleKeys.has(role);
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
      ALL_APP_ROLES.filter((role) => ROLE_PRIORITY[role] >= ROLE_PRIORITY[rule.minRole]),
    );
    return { pathPrefix: rule.pathPrefix, allowedRoleKeys };
  }).sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);
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
    const fallbackNavByRole: Record<AppRole, NavRouteItem[]> = {
      GM: [],
      MANAGER: [],
      SUPERVISOR: [],
      LEAD_TEAM_MEMBER: [],
      STAFF: [],
    };
    const fallbackNavDefs = [
      { label: "Dashboard", href: "/dashboard", minRole: "STAFF" as AppRole },
      { label: "Units", href: "/units", minRole: "SUPERVISOR" as AppRole },
      { label: "Employees", href: "/employees", minRole: "MANAGER" as AppRole },
      { label: "Logs", href: "/logs", minRole: "STAFF" as AppRole },
      { label: "Staffing", href: "/staffing", minRole: "SUPERVISOR" as AppRole },
      { label: "Menus", href: "/menus", minRole: "SUPERVISOR" as AppRole },
      { label: "Assets", href: "/assets", minRole: "SUPERVISOR" as AppRole },
      { label: "Repairs", href: "/repairs", minRole: "STAFF" as AppRole },
      { label: "Reports", href: "/reports", minRole: "MANAGER" as AppRole },
      { label: "Admin", href: "/admin", minRole: "GM" as AppRole },
    ];
    for (const role of ALL_APP_ROLES) {
      fallbackNavByRole[role] = fallbackNavDefs.filter(
        (item) => ROLE_PRIORITY[role] >= ROLE_PRIORITY[item.minRole],
      );
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

  const navItemsByRole: Record<AppRole, NavRouteItem[]> = {
    GM: [],
    MANAGER: [],
    SUPERVISOR: [],
    LEAD_TEAM_MEMBER: [],
    STAFF: [],
  };

  const navRouteDefs = [...routeMap.values()]
    .filter((item) => item.navVisible)
    .sort((a, b) => a.navOrder - b.navOrder || a.pathPrefix.localeCompare(b.pathPrefix));

  for (const role of ALL_APP_ROLES) {
    navItemsByRole[role] = navRouteDefs
      .filter((item) => item.allowedRoleKeys.has(role))
      .map((item) => ({ label: item.label, href: item.pathPrefix }));
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
