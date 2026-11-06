/**
 * On-call coverage is an OperationalAssignment whose role is the Department's
 * response responsibility. It is not supervisor rounding, not a job role, and
 * not the person assigned to one Work Order.
 */
const ON_CALL_COVERAGE_ROLE_BY_DEPARTMENT: Readonly<Record<string, string>> = {
  DIETARY: "DIETARY_ON_CALL_COVERAGE",
  EVS: "EVS_ON_CALL_COVERAGE",
  PLANT: "ON_CALL_COVERAGE",
};

export function onCallCoverageRoleKey(departmentKey: string): string | null {
  return ON_CALL_COVERAGE_ROLE_BY_DEPARTMENT[departmentKey] ?? null;
}

export function isOnCallCoverageRole(roleKey: string): boolean {
  return Object.values(ON_CALL_COVERAGE_ROLE_BY_DEPARTMENT).includes(roleKey);
}
