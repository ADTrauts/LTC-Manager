import type { NavRouteItem } from "@/lib/route-permissions";

/** Cookie stores facility department cuid (operational scope). */
export const ACTIVE_DEPARTMENT_COOKIE = "ltc_active_department";

export type OperationalDepartmentKey = "DIETARY" | "EVS" | "PLANT";

type NavDeptRule = { pathPrefix: string } & (
  | { visibility: "shared" }
  | { visibility: "department"; keys: OperationalDepartmentKey[] }
);

/**
 * Longest match wins. `/admin/organization` is treated like `/admin` unless listed separately.
 */
export const NAV_DEPARTMENT_RULES: NavDeptRule[] = [
  { pathPrefix: "/dashboard", visibility: "shared" },
  { pathPrefix: "/units", visibility: "shared" },
  { pathPrefix: "/employees", visibility: "shared" },
  { pathPrefix: "/logs", visibility: "shared" },
  { pathPrefix: "/staffing", visibility: "shared" },
  { pathPrefix: "/today", visibility: "shared" },
  { pathPrefix: "/reports", visibility: "shared" },
  { pathPrefix: "/department", visibility: "shared" },
  { pathPrefix: "/menus", visibility: "department", keys: ["DIETARY"] },
  { pathPrefix: "/evs", visibility: "department", keys: ["EVS"] },
  { pathPrefix: "/assets", visibility: "department", keys: ["PLANT"] },
  { pathPrefix: "/repairs", visibility: "department", keys: ["DIETARY", "PLANT"] },
  { pathPrefix: "/admin", visibility: "shared" },
  { pathPrefix: "/unit", visibility: "shared" },
];

function pathFromHref(href: string): string {
  const trimmed = href.trim();
  const q = trimmed.indexOf("?");
  const h = trimmed.indexOf("#");
  const end = [q === -1 ? trimmed.length : q, h === -1 ? trimmed.length : h].reduce((a, b) =>
    Math.min(a, b),
  );
  return trimmed.slice(0, end) || "/";
}

function ruleForPath(pathname: string): NavDeptRule | undefined {
  let best: NavDeptRule | undefined;
  let bestLen = -1;
  for (const rule of NAV_DEPARTMENT_RULES) {
    const p = rule.pathPrefix;
    if (pathname === p || pathname.startsWith(`${p}/`)) {
      if (p.length > bestLen) {
        best = rule;
        bestLen = p.length;
      }
    }
  }
  return best;
}

export function pathnameAllowedForDepartmentKey(
  pathname: string,
  departmentKey: OperationalDepartmentKey | null,
): boolean {
  const rule = ruleForPath(pathname);
  if (!rule || rule.visibility === "shared") {
    return true;
  }
  if (!departmentKey) {
    return false;
  }
  return rule.keys.includes(departmentKey);
}

export function filterNavItemsForDepartmentScope(
  items: NavRouteItem[],
  opts: {
    /** When true, bypass department hiding (facility-wide staffing data still handled elsewhere). */
    showAllDepartmentNav: boolean;
    activeOperationalDepartmentKey: OperationalDepartmentKey | null;
  },
): NavRouteItem[] {
  if (opts.showAllDepartmentNav) {
    return items;
  }
  const key = opts.activeOperationalDepartmentKey;
  return items.filter((item) => pathnameAllowedForDepartmentKey(pathFromHref(item.href), key));
}
