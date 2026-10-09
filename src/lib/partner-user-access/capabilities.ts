import type { OrganizationPartnerRole } from "@prisma/client";

/**
 * Product-defined partner operations. These do not open routes.
 * A surface still has to be registered and loaded for partners before the capability applies.
 * `logs.correct` is reserved for the correction actions Phase 2D3 explicitly certifies.
 */
export const PARTNER_CAPABILITIES = ["logs.read", "logs.submit", "logs.correct", "review.read", "locations.read"] as const;

export type PartnerCapability = (typeof PARTNER_CAPABILITIES)[number];

const PARTNER_CAPABILITY_GRANTS: Record<OrganizationPartnerRole, readonly PartnerCapability[]> = {
  PARTNER_VIEWER: ["logs.read", "review.read", "locations.read"],
  PARTNER_OPERATOR: ["logs.read", "logs.submit", "review.read", "locations.read"],
  PARTNER_MANAGER: ["logs.read", "logs.submit", "logs.correct", "review.read", "locations.read"],
};

export function canPartner(role: OrganizationPartnerRole, capability: PartnerCapability): boolean {
  const granted = PARTNER_CAPABILITY_GRANTS[role];
  if (!granted) return false;
  return granted.includes(capability);
}
