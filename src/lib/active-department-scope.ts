/**
 * Customer pickers omit DEVELOPMENT products. Members whose primary Department
 * is one of those products still need operational scope so RUN Maintenance
 * (`/repairs`, `/asset-issues`) is not a dead end.
 */
export function resolveMembershipPrimaryOperationalDepartmentId(input: {
  selectableDepartmentId: string | null;
  sessionPrimaryDepartmentId: string | null | undefined;
  employeePrimaryDepartmentId: string | null | undefined;
  memberDepartmentIds: readonly string[];
}): string | null {
  if (input.selectableDepartmentId) return input.selectableDepartmentId;
  for (const candidate of [input.sessionPrimaryDepartmentId, input.employeePrimaryDepartmentId]) {
    const id = candidate?.trim();
    if (id && input.memberDepartmentIds.includes(id)) return id;
  }
  return null;
}
