/**
 * Profile access guards — pure.
 *
 * All profile write operations require:
 * - DEPARTMENT_OPERATIONAL_PROFILES_ENABLED flag on;
 * - Manager+ (Department Administration standard);
 * - session facility matches the target facility.
 */

import { hasAtLeastRole, type AppRole } from "@/lib/access";

export type ProfileWriteContext = {
  flagEnabled: boolean;
  role: AppRole;
  sessionFacilityId: string;
  targetFacilityId: string;
};

export type ProfileAccessDenial = { code: string; message: string };

export function checkProfileWriteAccess(
  context: ProfileWriteContext,
): ProfileAccessDenial | null {
  if (!context.flagEnabled) {
    return {
      code: "feature_disabled",
      message: "Department Operational Profiles are not enabled.",
    };
  }
  if (!hasAtLeastRole(context.role, "MANAGER")) {
    return {
      code: "insufficient_role",
      message: "Manager or above required for Department Administration.",
    };
  }
  if (context.sessionFacilityId !== context.targetFacilityId) {
    return {
      code: "cross_facility",
      message: "Cross-facility access rejected.",
    };
  }
  return null;
}

export function assertProfileWriteAccess(context: ProfileWriteContext): void {
  const denial = checkProfileWriteAccess(context);
  if (denial) {
    throw new Error(denial.message);
  }
}
