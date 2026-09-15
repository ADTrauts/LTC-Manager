/**
 * Canonical client-safe navigation after an active-department change.
 *
 * Cookie write stays on POST /api/auth/active-department.
 * Shell/header always re-reads via router.refresh().
 * Department-scoped URLs are rewritten to match the new context.
 */

import { departmentBuilderHrefAfterDepartmentSwitch } from "@/lib/department-administration/builder-entry";

export const DEPARTMENT_BUILDER_AREA_PREFIX = "/admin/departments";

/** Department Builder list or a specific workspace. */
export function isDepartmentBuilderAreaPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname === DEPARTMENT_BUILDER_AREA_PREFIX ||
    pathname.startsWith(`${DEPARTMENT_BUILDER_AREA_PREFIX}/`)
  );
}

/** Workspace department id from `/admin/departments/{id}` (not the facility list). */
export function departmentIdFromBuilderWorkspacePath(
  pathname: string | null | undefined,
): string | null {
  if (!pathname) return null;
  const match = /^\/admin\/departments\/([^/]+)\/?$/.exec(pathname);
  const id = match?.[1]?.trim();
  return id ? id : null;
}

/**
 * When the current surface encodes a department in the URL, return the href that keeps
 * that surface aligned with the new active department. `null` means refresh in place.
 */
export function hrefAfterActiveDepartmentChange(input: {
  nextDepartmentId: string | null;
  currentPathname: string;
  currentSearch?: string;
}): string | null {
  if (!isDepartmentBuilderAreaPath(input.currentPathname)) {
    return null;
  }
  return departmentBuilderHrefAfterDepartmentSwitch(input);
}

/**
 * A department-scoped Builder workspace must not disagree with the header/cookie context.
 * If the route names an authorized department that is not the current selection, sync to the route.
 */
export function shouldSyncActiveDepartmentFromRoute(input: {
  routeDepartmentId: string | null;
  selectedDepartmentId: string | null;
  selectableDepartmentIds: readonly string[];
}): boolean {
  const routeId = input.routeDepartmentId?.trim() || null;
  if (!routeId) return false;
  if (!input.selectableDepartmentIds.includes(routeId)) return false;
  return routeId !== input.selectedDepartmentId;
}

