/**
 * Department Builder entry resolution.
 *
 * Global department selector is the department lens.
 * Build → Department Builder opens that department's operational workspace.
 * Admin → Departments owns installation, Marketplace, and administrative controls.
 */

import { isPreventiveMaintenanceBuilderPath, resolveDepartmentAdminTab } from "./admin-nav";

export const DEPARTMENT_BUILDER_LIST_HREF = "/build/departments";
export const ADMIN_DEPARTMENTS_HREF = "/admin/departments";
export const ADMIN_DEPARTMENTS_MARKETPLACE_HREF = "/admin/departments?marketplace=1";

export function adminDepartmentManageHref(departmentId: string): string {
  return `${ADMIN_DEPARTMENTS_HREF}/${departmentId}/manage`;
}

/** @deprecated Compatibility alias — the facility list now lives in Admin. */
export function departmentBuilderAllDepartmentsHref(): string {
  return ADMIN_DEPARTMENTS_HREF;
}

/** Selected-department workspace (Overview by default). */
export function departmentBuilderWorkspaceHref(departmentId: string): string {
  return `${DEPARTMENT_BUILDER_LIST_HREF}/${departmentId}`;
}

/**
 * Resolve the Build sidebar / hub href for Department Builder.
 * When a selected department exists, deep-link into its workspace.
 * When none is selected, `/build/departments` resolves the operable Department.
 */
export function resolveDepartmentBuilderEntryHref(
  activeDepartmentId: string | null | undefined,
): string {
  if (activeDepartmentId && activeDepartmentId.trim()) {
    return departmentBuilderWorkspaceHref(activeDepartmentId.trim());
  }
  return DEPARTMENT_BUILDER_LIST_HREF;
}

/**
 * Rewrite nav/hub items that point at the Department Builder list so a selected
 * department opens the workspace directly. Leaves other items unchanged.
 */
export function rewriteDepartmentBuilderNavHref<T extends { href: string }>(
  items: readonly T[],
  activeDepartmentId: string | null | undefined,
): T[] {
  const target = resolveDepartmentBuilderEntryHref(activeDepartmentId);
  if (target === DEPARTMENT_BUILDER_LIST_HREF) {
    return [...items];
  }
  return items.map((item) =>
    item.href === DEPARTMENT_BUILDER_LIST_HREF ? { ...item, href: target } : item,
  );
}

/** True when pathname is a Department Builder workspace (not Admin management). */
export function isDepartmentBuilderWorkspacePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /^\/build\/departments\/[^/]+/.test(pathname);
}

/**
 * When switching the global department while already inside a Department Builder
 * workspace, preserve the local tab (and drop profile, which is department-specific).
 */
export function departmentBuilderHrefAfterDepartmentSwitch(input: {
  nextDepartmentId: string | null;
  currentPathname: string;
  currentSearch?: string;
}): string {
  if (!input.nextDepartmentId) {
    return DEPARTMENT_BUILDER_LIST_HREF;
  }
  const params = new URLSearchParams(
    input.currentSearch?.startsWith("?")
      ? input.currentSearch.slice(1)
      : (input.currentSearch ?? ""),
  );
  params.delete("profile");
  if (isPreventiveMaintenanceBuilderPath(input.currentPathname)) {
    return `/build/departments/${input.nextDepartmentId}/preventive-maintenance`;
  }
  const requestedTab = params.get("tab");
  const tab = requestedTab ? resolveDepartmentAdminTab(requestedTab) : "overview";
  const query = new URLSearchParams();
  if (tab !== "overview") query.set("tab", tab);
  const qs = query.toString();
  const base = departmentBuilderWorkspaceHref(input.nextDepartmentId);
  return qs ? `${base}?${qs}` : base;
}

/**
 * Compatibility query on `/build/departments` that used to force the management list.
 * Those URLs now belong to Admin.
 */
export function adminDepartmentsHrefFromLegacyBuildQuery(input: {
  marketplace?: boolean;
  all?: boolean;
}): string {
  if (input.marketplace) return ADMIN_DEPARTMENTS_MARKETPLACE_HREF;
  return ADMIN_DEPARTMENTS_HREF;
}
