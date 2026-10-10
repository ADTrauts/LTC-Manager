import {
  isAccountSession,
  isFacilityScopedSession,
  isOrganizationScopedSession,
  isPartnerFacilitySession,
  type AppJwtPayload,
} from "@/lib/auth";

import {
  internalFacilityContextKey,
  organizationContextKey,
  partnerFacilityContextKey,
} from "./keys";

/**
 * Exact current workspace key, or null when no workspace is selected.
 * PIN and Harbor are not User contexts and never produce a key.
 */
export function currentContextKeyFromSession(session: AppJwtPayload): string | null {
  if (session.authKind !== "user") {
    return null;
  }
  if (isAccountSession(session)) {
    return null;
  }
  if (isOrganizationScopedSession(session)) {
    return organizationContextKey(session.organizationId);
  }
  if (isPartnerFacilitySession(session)) {
    return partnerFacilityContextKey(session.facilityPartnerOrganizationId);
  }
  if (isFacilityScopedSession(session)) {
    return internalFacilityContextKey(session.facilityId);
  }
  return null;
}
