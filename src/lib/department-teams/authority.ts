import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { AuthMethod } from "@/lib/auth";

export type TeamAuthorityDecision = {
  canView: boolean;
  canManage: boolean;
  reason: string | null;
};

const DENIED: TeamAuthorityDecision = {
  canView: false,
  canManage: false,
  reason: "Insufficient Team configuration authority.",
};

/**
 * Department Builder Team configuration.
 * Manager+ password sessions may manage. Quick PIN never grants Build.
 * Same band as Department Builder Locations / comparable Department configuration.
 */
export function decideTeamAuthority(input: {
  role: AppRole;
  authMethod: AuthMethod;
  sessionFacilityId: string;
  facilityId: string;
  departmentExists: boolean;
}): TeamAuthorityDecision {
  if (input.sessionFacilityId !== input.facilityId) {
    return { ...DENIED, reason: "Cross-facility Team access denied." };
  }
  if (!input.departmentExists) {
    return { ...DENIED, reason: "Department not found." };
  }
  if (input.authMethod === "QUICK_PIN") {
    return {
      canView: hasAtLeastRole(input.role, "MANAGER"),
      canManage: false,
      reason: "Quick PIN does not grant Team configuration access.",
    };
  }
  if (!hasAtLeastRole(input.role, "MANAGER")) {
    return { ...DENIED, reason: "Manager or above required to configure Teams." };
  }
  return { canView: true, canManage: true, reason: null };
}

export function requireTeamManage(decision: TeamAuthorityDecision): void {
  if (!decision.canManage) {
    throw new Error(decision.reason ?? "Insufficient Team configuration authority.");
  }
}
