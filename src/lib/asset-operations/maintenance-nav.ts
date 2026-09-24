/**
 * RUN Maintenance — one operational category over Assets + Repairs.
 *
 * Assets and Repairs stay separate screens (condition vs work queue). The shell
 * presents a single RUN nav item so operators are not hunting two modules for
 * the same equipment loop. BUILD Asset Builder is unchanged.
 */

export const MAINTENANCE_NAV_LABEL = "Maintenance" as const;
export const MAINTENANCE_ASSETS_HREF = "/assets" as const;
export const MAINTENANCE_REPAIRS_HREF = "/repairs" as const;
export const MAINTENANCE_VENDORS_HREF = "/assets?subtab=vendors" as const;

export type MaintenanceNavRewriteOptions = {
  /** SUPERVISOR+ land on Assets; STAFF keep the repair queue. Default true. */
  canViewAssets?: boolean;
};

export type MaintenanceSubNavId = "assets" | "repairs" | "vendors";

export type MaintenanceSubNavItem = {
  id: MaintenanceSubNavId;
  label: string;
  href: string;
};

export const MAINTENANCE_SUBNAV_ITEMS: readonly MaintenanceSubNavItem[] = [
  { id: "assets", label: "Assets", href: MAINTENANCE_ASSETS_HREF },
  { id: "repairs", label: "Repairs", href: MAINTENANCE_REPAIRS_HREF },
  { id: "vendors", label: "Vendors", href: MAINTENANCE_VENDORS_HREF },
];

function pathOnly(pathname: string): string {
  return pathname.split("?")[0]?.split("#")[0] ?? pathname;
}

export function isRunMaintenancePath(pathname: string | null): boolean {
  if (!pathname) return false;
  const path = pathOnly(pathname);
  if (path === "/assets/builder" || path.startsWith("/assets/builder/")) {
    return false;
  }
  return (
    path === "/assets" ||
    path.startsWith("/assets/") ||
    path === "/repairs" ||
    path.startsWith("/repairs/") ||
    path === "/issues" ||
    path.startsWith("/issues/") ||
    path === "/asset-issues" ||
    path.startsWith("/asset-issues/")
  );
}

export function maintenanceSubNavItems(canViewAssets: boolean): MaintenanceSubNavItem[] {
  return canViewAssets ? [...MAINTENANCE_SUBNAV_ITEMS] : [];
}

export function resolveMaintenanceSubNavActiveId(
  pathname: string | null,
  subtab?: string | null,
): MaintenanceSubNavId {
  if (!pathname) return "assets";
  const path = pathOnly(pathname);
  if (
    path === "/repairs" ||
    path.startsWith("/repairs/") ||
    path === "/issues" ||
    path.startsWith("/issues/") ||
    path === "/asset-issues" ||
    path.startsWith("/asset-issues/")
  ) {
    return "repairs";
  }
  if (subtab === "vendors") return "vendors";
  return "assets";
}

function withHrefLabel<T extends { href: string }>(template: T, href: string, label: string): T {
  return { ...template, href, ...("label" in template ? { label } : {}) } as T;
}

/**
 * Collapse RUN Assets + Repairs into one Maintenance destination.
 *
 * SUPERVISOR+ keep `/assets` (sub-nav reaches Repairs). STAFF keep `/repairs`
 * because `/assets` is supervisor-gated. Routes stay reachable by URL.
 */
export function applyMaintenanceNavRewrite<T extends { href: string }>(
  items: readonly T[],
  options?: MaintenanceNavRewriteOptions,
): T[] {
  const canViewAssets = options?.canViewAssets !== false;
  const canonicalHref = canViewAssets ? MAINTENANCE_ASSETS_HREF : MAINTENANCE_REPAIRS_HREF;
  const result: T[] = [];
  let placed = false;

  for (const item of items) {
    if (item.href === MAINTENANCE_ASSETS_HREF || item.href === MAINTENANCE_REPAIRS_HREF) {
      if (!placed) {
        result.push(withHrefLabel(item, canonicalHref, MAINTENANCE_NAV_LABEL));
        placed = true;
      }
      continue;
    }
    result.push(item);
  }

  return result;
}
