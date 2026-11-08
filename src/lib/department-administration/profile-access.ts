/**
 * Profile access guards — pure.
 *
 * Profile writes that publishing still uses require:
 * - Manager+ (Department Administration standard);
 * - session facility matches the target facility.
 * Location Function binding uses pattern authoring access.
 */

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import type { AuthMethod } from "@/lib/auth";

export type ProfileWriteContext = {
  role: AppRole;
  sessionFacilityId: string;
  targetFacilityId: string;
};

/** Locations operational-type authoring — Manager+ password, independent of the full Profiles flag. */
export type PatternAuthoringContext = {
  role: AppRole;
  authMethod: AuthMethod;
  sessionFacilityId: string;
  targetFacilityId: string;
};

export type ProfileAccessDenial = { code: string; message: string };

export function checkProfileWriteAccess(
  context: ProfileWriteContext,
): ProfileAccessDenial | null {
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

/**
 * Department Builder Locations may create/assign operational types (room archetypes)
 * without enabling the full Operational Profiles authoring surface.
 * Quick PIN never grants Build configuration.
 */
export function checkPatternAuthoringAccess(
  context: PatternAuthoringContext,
): ProfileAccessDenial | null {
  if (context.authMethod === "QUICK_PIN") {
    return {
      code: "quick_pin",
      message: "Password authentication is required to configure operational types.",
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

export function assertPatternAuthoringAccess(context: PatternAuthoringContext): void {
  const denial = checkPatternAuthoringAccess(context);
  if (denial) {
    throw new Error(denial.message);
  }
}
