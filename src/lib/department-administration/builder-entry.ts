/**
 * Department Builder entry resolution.
 *
 * Global department selector (cookie `ltc_active_department`) is the department lens.
 * Build → Department Builder should open that department's workspace when a selection exists.
 */

export const DEPARTMENT_BUILDER_LIST_HREF = "/admin/departments";
export const DEPARTMENT_BUILDER_ALL_QUERY = "all=1";

/** Facility-management list (bypass selected-department redirect). */
export function departmentBuilderAllDepartmentsHref(): string {
  return `${DEPARTMENT_BUILDER_LIST_HREF}?${DEPARTMENT_BUILDER_ALL_QUERY}`;
}

/** Selected-department workspace (Overview by default). */
export function departmentBuilderWorkspaceHref(departmentId: string): string {
  return `${DEPARTMENT_BUILDER_LIST_HREF}/${departmentId}`;
}

/**
 * Resolve the Build sidebar / hub href for Department Builder.
 * When a selected department exists, deep-link into its workspace.
 * When FA is in all-departments mode (null id), keep the list href.
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

/** True when pathname is a Department Builder workspace (not the facility list). */
export function isDepartmentBuilderWorkspacePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /^\/admin\/departments\/[^/]+/.test(pathname);
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
    return departmentBuilderAllDepartmentsHref();
  }
  const params = new URLSearchParams(
    input.currentSearch?.startsWith("?")
      ? input.currentSearch.slice(1)
      : (input.currentSearch ?? ""),
  );
  params.delete("profile");
  const tab = params.get("tab");
  const query = new URLSearchParams();
  if (tab && tab !== "overview") query.set("tab", tab);
  const qs = query.toString();
  const base = departmentBuilderWorkspaceHref(input.nextDepartmentId);
  return qs ? `${base}?${qs}` : base;
}

/** Whether the list page should redirect into the selected department workspace. */
export function shouldRedirectDepartmentsListToWorkspace(input: {
  activeDepartmentId: string | null | undefined;
  /** When true (`?all=1`), keep the facility-level management list. */
  forceAllDepartments: boolean;
}): boolean {
  if (input.forceAllDepartments) return false;
  return Boolean(input.activeDepartmentId?.trim());
}
