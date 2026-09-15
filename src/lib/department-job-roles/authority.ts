import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { AuthMethod } from "@/lib/auth";

export type JobRoleAuthorityDecision = {
  canView: boolean;
  canManage: boolean;
  reason: string | null;
};

const DENIED: JobRoleAuthorityDecision = {
  canView: false,
  canManage: false,
  reason: "Insufficient Job Role configuration authority.",
};

/**
 * Employee Builder Job Role configuration.
 * Manager+ password sessions may manage. Quick PIN never grants Build.
 */
export function decideJobRoleAuthority(input: {
  role: AppRole;
  authMethod: AuthMethod;
  sessionFacilityId: string;
  facilityId: string;
  departmentExists: boolean;
}): JobRoleAuthorityDecision {
  if (input.sessionFacilityId !== input.facilityId) {
    return { ...DENIED, reason: "Cross-facility Job Role access denied." };
  }
  if (!input.departmentExists) {
    return { ...DENIED, reason: "Department not found." };
  }
  if (input.authMethod === "QUICK_PIN") {
    return {
      canView: hasAtLeastRole(input.role, "MANAGER"),
      canManage: false,
      reason: "Quick PIN does not grant Job Role configuration access.",
    };
  }
  if (!hasAtLeastRole(input.role, "MANAGER")) {
    return { ...DENIED, reason: "Manager or above required to configure Job Roles." };
  }
  return { canView: true, canManage: true, reason: null };
}

export function requireJobRoleManage(decision: JobRoleAuthorityDecision): void {
  if (!decision.canManage) {
    throw new Error(decision.reason ?? "Insufficient Job Role configuration authority.");
  }
}
