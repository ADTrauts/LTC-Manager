import type { OrganizationMembershipRole, OrganizationPartnerRole } from "@prisma/client";

import {
  isAccountSession,
  isFacilityScopedSession,
  isOrganizationScopedSession,
  isPartnerFacilitySession,
  type AppJwtPayload,
} from "@/lib/auth";
import { partnerRoleLabel } from "@/lib/partner-user-access";

import { internalFacilityRoleLabel, organizationContextRoleLabel } from "./presentation";

export type CurrentContextNameHints = {
  facilityName?: string | null;
  organizationName?: string | null;
  partnerOrganizationName?: string | null;
  organizationRole?: OrganizationMembershipRole | null;
  partnerRole?: OrganizationPartnerRole | null;
};

export type CurrentContextPresentation = {
  title: string;
  subtitle: string;
};

/**
 * Display-only current workspace label from the live session plus names the shell already loaded.
 * Not authority. Does not read available contexts.
 */
export function presentCurrentContextFromSession(
  session: AppJwtPayload,
  names: CurrentContextNameHints = {},
): CurrentContextPresentation | null {
  if (session.authKind !== "user") {
    return null;
  }
  if (isAccountSession(session)) {
    return { title: "My Access", subtitle: "No workspace selected" };
  }
  if (isOrganizationScopedSession(session)) {
    const title = names.organizationName?.trim() || "Organization";
    const subtitle = names.organizationRole
      ? `Organization · ${organizationContextRoleLabel(names.organizationRole)}`
      : "Organization";
    return { title, subtitle };
  }
  if (isPartnerFacilitySession(session)) {
    const title = names.facilityName?.trim() || "Facility";
    const via = names.partnerOrganizationName?.trim() || "Organization";
    const role = names.partnerRole ? partnerRoleLabel(names.partnerRole) : "Partner";
    return { title, subtitle: `Via ${via} · ${role}` };
  }
  if (isFacilityScopedSession(session) && session.role) {
    return {
      title: names.facilityName?.trim() || "Facility",
      subtitle: `Internal · ${internalFacilityRoleLabel(session.role)}`,
    };
  }
  return null;
}
