import {
  hasDietaryDomainCapabilities,
  parseOperationalDepartmentKey,
} from "@/lib/department-admission";
import type { NavRouteItem } from "@/lib/nav-zones";

/** Cookie stores facility department cuid (operational scope). */
export const ACTIVE_DEPARTMENT_COOKIE = "ltc_active_department";

/**
 * Any department key, including user-created departments.
 * Domain modules remain the exact strings DIETARY / EVS / PLANT.
 */
export type OperationalDepartmentKey = string;

type NavDeptRule = { pathPrefix: string } & (
  | { visibility: "shared" }
  | { visibility: "sharedOperational" }
  | { visibility: "dietaryDomain" }
);

/**
 * Longest match wins. `/admin/organization` is treated like `/admin` unless listed separately.
 */
export const NAV_DEPARTMENT_RULES: NavDeptRule[] = [
  { pathPrefix: "/build", visibility: "shared" },
  { pathPrefix: "/workspace", visibility: "shared" },
  { pathPrefix: "/dashboard", visibility: "shared" },
  { pathPrefix: "/operations", visibility: "shared" },
  { pathPrefix: "/units", visibility: "shared" },
  { pathPrefix: "/employees", visibility: "shared" },
  { pathPrefix: "/logs", visibility: "shared" },
  { pathPrefix: "/staffing", visibility: "shared" },
  { pathPrefix: "/today", visibility: "shared" },
  { pathPrefix: "/reports", visibility: "shared" },
  { pathPrefix: "/department", visibility: "shared" },
  { pathPrefix: "/menus", visibility: "dietaryDomain" },
  { pathPrefix: "/assets", visibility: "sharedOperational" },
  { pathPrefix: "/asset-issues", visibility: "sharedOperational" },
  { pathPrefix: "/repairs", visibility: "sharedOperational" },
  { pathPrefix: "/issues", visibility: "sharedOperational" },
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
  departmentKey: string | null,
): boolean {
  const rule = ruleForPath(pathname);
  if (!rule || rule.visibility === "shared") {
    return true;
  }
  const key = parseOperationalDepartmentKey(departmentKey);
  if (!key) {
    return false;
  }
  if (rule.visibility === "sharedOperational") {
    return true;
  }
  return hasDietaryDomainCapabilities(key);
}

export function filterNavItemsForDepartmentScope(
  items: NavRouteItem[],
  opts: {
    /** When true, bypass department hiding (facility-wide staffing data still handled elsewhere). */
    showAllDepartmentNav: boolean;
    activeOperationalDepartmentKey: string | null;
  },
): NavRouteItem[] {
  if (opts.showAllDepartmentNav) {
    return items;
  }
  const key = opts.activeOperationalDepartmentKey;
  return items.filter((item) => pathnameAllowedForDepartmentKey(pathFromHref(item.href), key));
}
