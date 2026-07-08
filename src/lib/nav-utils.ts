/**
 * Shared active-state matching for top nav and sidebar links.
 */
export function isActiveNavPath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/employees") {
    return (
      pathname === "/employees" ||
      pathname.startsWith("/employees/import") ||
      pathname.startsWith("/employees/points-summary") ||
      pathname.startsWith("/employees/separations") ||
      pathname.startsWith("/employees/terminations") ||
      pathname.startsWith("/employees/chrc-report") ||
      pathname.startsWith("/employees/hr-audit")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
