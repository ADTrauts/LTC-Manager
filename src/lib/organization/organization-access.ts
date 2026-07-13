import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";

/**
 * Organization helpers never expand facility scope.
 * A shared Organization does not authorize sibling facility access.
 */
export function assertSameFacilityScope(sessionFacilityId: string, resourceFacilityId: string): void {
  if (sessionFacilityId !== resourceFacilityId) {
    throw new Error("Cross-facility access denied.");
  }
}

/** Editing organization metadata requires Facility Administrator. */
export function canEditOrganizationSettings(role: AppRole): boolean {
  return hasAtLeastRole(role, "FACILITY_ADMINISTRATOR");
}

/**
 * Cross-organization facility reassignment is not allowed in Wave 11 M1.
 * Organization assignment remains read-only on the facility settings surface.
 */
export function canReassignFacilityOrganization(_role: AppRole): boolean {
  void _role;
  return false;
}

export function assertOrganizationBelongsToFacilitySession(input: {
  sessionFacilityId: string;
  sessionOrganizationId: string;
  targetOrganizationId: string;
}): void {
  if (input.sessionOrganizationId !== input.targetOrganizationId) {
    throw new Error("Cross-organization access denied.");
  }
  void input.sessionFacilityId;
}
