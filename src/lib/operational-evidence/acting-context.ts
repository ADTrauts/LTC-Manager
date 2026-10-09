import type { OrganizationPartnerRole } from "@prisma/client";

/**
 * Authority facts captured when a partner action succeeds.
 * Stored as written. Later role or partnership changes do not recompute them.
 */
export type PartnerActingContext = {
  accessKind: "partner";
  partnerOrganizationId: string;
  facilityPartnerOrganizationId: string;
  effectivePartnerRole: OrganizationPartnerRole;
};

export function partnerActingColumns(acting: PartnerActingContext) {
  return {
    actingAccessKind: acting.accessKind,
    actingPartnerOrganizationId: acting.partnerOrganizationId,
    actingFacilityPartnerOrganizationId: acting.facilityPartnerOrganizationId,
    actingEffectivePartnerRole: acting.effectivePartnerRole,
  };
}
