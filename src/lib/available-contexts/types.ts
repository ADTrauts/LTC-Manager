import type { OrganizationMembershipRole, OrganizationPartnerRole, RoleKey } from "@prisma/client";

export type OrganizationAvailableContext = {
  kind: "organization";
  contextKey: `organization:${string}`;
  organizationId: string;
  membershipId: string;
  organizationRole: OrganizationMembershipRole;
};

export type InternalFacilityAvailableContext = {
  kind: "facility_internal";
  contextKey: `facility_internal:${string}`;
  facilityId: string;
  organizationId: string;
  accessId: string;
  role: RoleKey;
  isHome: boolean;
};

export type PartnerFacilityAvailableContext = {
  kind: "facility_partner";
  contextKey: `facility_partner:${string}`;
  facilityId: string;
  partnerOrganizationId: string;
  facilityPartnerOrganizationId: string;
  effectivePartnerRole: OrganizationPartnerRole;
  allowedDepartmentIds: string[];
};

export type AvailableContext =
  | OrganizationAvailableContext
  | InternalFacilityAvailableContext
  | PartnerFacilityAvailableContext;

export type AvailableContextKind = AvailableContext["kind"];

/**
 * Display facts needed to render a chooser. Not authority.
 * Machine `context` remains the only identity/eligibility row.
 */
export type AvailableContextRecord = {
  context: AvailableContext;
  organizationName: string;
  facilityName: string | null;
  partnerOrganizationName: string | null;
  departmentNames: string[];
};

export type AvailableContextPresentationGroup =
  | "Organizations"
  | "Internal Facilities"
  | "Client Facilities";

export type AvailableContextPresentation = {
  contextKey: string;
  kind: AvailableContextKind;
  group: AvailableContextPresentationGroup;
  title: string;
  subtitle: string;
  roleLabel: string;
  isHome: boolean;
  departmentSummary: string | null;
};

export class AvailableContextError extends Error {
  readonly code: "USER_NOT_FOUND" | "USER_INACTIVE";

  constructor(code: AvailableContextError["code"], message: string) {
    super(message);
    this.name = "AvailableContextError";
    this.code = code;
  }
}
