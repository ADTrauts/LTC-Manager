/**
 * Department-scoped articles may only link to operational objects that belong to the
 * same department (or are facility-wide with null departmentId).
 * Facility-wide articles (no departmentId) may link to any object in the facility.
 */
export type DepartmentScopedEntity = {
  departmentId: string | null;
};

export type UnitDepartmentScope = {
  departmentIds: string[];
};

export function isDepartmentCompatibleLink(
  articleDepartmentId: string | null | undefined,
  entityDepartmentId: string | null | undefined,
): boolean {
  if (!articleDepartmentId) return true;
  if (!entityDepartmentId) return true;
  return articleDepartmentId === entityDepartmentId;
}

export function isUnitCompatibleWithArticleDepartment(
  articleDepartmentId: string | null | undefined,
  unitDepartments: UnitDepartmentScope,
): boolean {
  if (!articleDepartmentId) return true;
  return unitDepartments.departmentIds.includes(articleDepartmentId);
}

export function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function objectLinkCompatibilityError(
  objectLabel: string,
  articleDepartmentName?: string | null,
): string {
  return articleDepartmentName
    ? `${objectLabel} belongs to a different department than this article (${articleDepartmentName}). Use a facility-wide article or pick objects from the same department.`
    : `${objectLabel} is not compatible with this article's department scope.`;
}
