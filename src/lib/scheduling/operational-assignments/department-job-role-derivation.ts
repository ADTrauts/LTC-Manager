import { getRolesForDepartment } from "@/lib/scheduling/assignment-roles";

/**
 * Derive the default operational roleKey for new RUN Daily Assignments
 * from the employee's Department Job Role tier (BUILD operational identity).
 *
 * This is intentionally pure so it can be hermetically tested.
 */
export function deriveDefaultRoleKeyForDepartmentJobRole(input: {
  departmentKey: string;
  tier: string | null | undefined;
}): string {
  const roles = getRolesForDepartment(input.departmentKey);
  if (roles.length === 0) {
    throw new Error(`No operational roles configured for ${input.departmentKey}.`);
  }

  const supervisor = roles.find((r) => r.key.includes("SUPERVISOR_ROUNDING"))?.key;
  const teamMember = (() => {
    if (input.departmentKey === "DIETARY") return roles.find((r) => r.key === "SERVER")?.key ?? roles[0]!.key;
    if (input.departmentKey === "EVS") return roles.find((r) => r.key === "CLEANING_ROUND")?.key ?? roles[0]!.key;
    if (input.departmentKey === "PLANT") return roles.find((r) => r.key === "WORK_ORDER_RESPONSE")?.key ?? roles[0]!.key;
    return roles[0]!.key;
  })();

  const lead = (() => {
    if (input.departmentKey === "DIETARY") return roles.find((r) => r.key === "CALL_DOWN_RUNNER")?.key ?? roles[0]!.key;
    if (input.departmentKey === "EVS") return roles.find((r) => r.key === "FLOOR_CARE")?.key ?? roles[0]!.key;
    if (input.departmentKey === "PLANT") return roles.find((r) => r.key === "EQUIPMENT_ROUND")?.key ?? roles[0]!.key;
    return roles[0]!.key;
  })();

  const normalizedTier = input.tier ?? null;
  if (normalizedTier === "SUPERVISOR" || normalizedTier === "MANAGER") return supervisor ?? roles[0]!.key;
  if (normalizedTier === "LEAD") return lead;
  if (normalizedTier === "TEAM_MEMBER") return teamMember;

  // Legacy / missing tier: safest fallback is the first valid role for the department.
  return roles[0]!.key;
}

/** Historical snapshot behavior: prefer jobRole displayName when present. */
export function deriveRoleLabelSnapshot(input: {
  jobRoleDisplayName: string | null | undefined;
  roleDefLabel: string;
}): string {
  return input.jobRoleDisplayName?.trim() ? input.jobRoleDisplayName : input.roleDefLabel;
}

