import type { OrganizationPartnerRole } from "@prisma/client";

import type { FacilitySession, PartnerFacilitySession } from "@/lib/auth";

/** Accepted head, or a Partner Manager on that Department. Operators and viewers do not set up. */
export function partnerMaySetUpDepartment(input: {
  mode: string;
  isHead: boolean;
  effectiveRole: OrganizationPartnerRole;
}): boolean {
  return input.mode === "MANAGE" && (input.isHead || input.effectiveRole === "PARTNER_MANAGER");
}

/** Lets a partner setup session use a Department service that still checks a facility manager role. */
export function partnerAuthorSession(session: PartnerFacilitySession): FacilitySession {
  return { ...session, role: "MANAGER" } as FacilitySession;
}
