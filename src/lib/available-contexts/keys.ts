export function organizationContextKey(organizationId: string): `organization:${string}` {
  return `organization:${organizationId}`;
}

export function internalFacilityContextKey(facilityId: string): `facility_internal:${string}` {
  return `facility_internal:${facilityId}`;
}

export function partnerFacilityContextKey(
  facilityPartnerOrganizationId: string,
): `facility_partner:${string}` {
  return `facility_partner:${facilityPartnerOrganizationId}`;
}
