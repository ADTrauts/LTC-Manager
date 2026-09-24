import { isRunMaintenancePath } from "@/lib/asset-operations/maintenance-nav";

/**
 * Shared active-state matching for top nav and sidebar links.
 */
export function isActiveNavPath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/assets" || href === "/repairs") {
    return isRunMaintenancePath(pathname);
  }
  if (href === "/employees") {
    return (
      pathname === "/employees" ||
      pathname.startsWith("/employees/import") ||
      pathname.startsWith("/employees/job-roles") ||
      pathname.startsWith("/employees/points-summary") ||
      pathname.startsWith("/employees/separations") ||
      pathname.startsWith("/employees/terminations") ||
      pathname.startsWith("/employees/chrc-report") ||
      pathname.startsWith("/employees/hr-audit")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Room vs Neighborhood: `/unit/:id?space=` is not the same location as `/unit/:id`.
 */
export function isActiveLocationHref(
  pathname: string | null,
  currentSearch: string,
  href: string,
): boolean {
  if (!pathname) return false;
  const [path, query = ""] = href.split("?");
  if (!path || !isActiveNavPath(pathname, path)) return false;
  const hrefSpace = new URLSearchParams(query).get("space");
  const currentSpace = new URLSearchParams(
    currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch,
  ).get("space");
  if (hrefSpace) return hrefSpace === currentSpace;
  return !currentSpace;
}
