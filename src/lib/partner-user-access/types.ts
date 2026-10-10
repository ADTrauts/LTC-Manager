import type { OrganizationMembershipRole, OrganizationPartnerRole, RoleKey } from "@prisma/client";

/**
 * Current rows that are not timestamped. A resolver instant in the past still
 * sees today's value for these fields. Ceiling, assignment role, membership role,
 * partnership access, and Department scope periods are the versioned facts.
 */
export const UNVERSIONED_AUTHORIZATION_FACTS = [
  "User.isActive",
  "Organization.isActive",
  "Department.isActive",
] as const;

export type UnversionedAuthorizationFact = (typeof UNVERSIONED_AUTHORIZATION_FACTS)[number];

export const PARTNER_ASSIGNMENT_AUTHORITIES = ["facility_admin", "partner_org_admin"] as const;

export type PartnerAssignmentAuthorityKind = (typeof PARTNER_ASSIGNMENT_AUTHORITIES)[number];

/**
 * Explicit writer for the shared assignment mutation.
 * `actorUserId` stays on the mutation input. `organizationId` is the signed acting
 * Organization and must match the partnership Organization.
 */
export type PartnerAssignmentMutationAuthority =
  | { kind: "facility_admin" }
  | { kind: "partner_org_admin"; organizationId: string };

export const PARTNER_ROLE_PERIOD_END_REASONS = [
  "ROLE_CHANGED",
  "ASSIGNMENT_ENDED",
  "FACILITY_BLOCKED",
  "ORGANIZATION_MEMBERSHIP_ENDED",
] as const;

export type PartnerUserRolePeriodEndReason = (typeof PARTNER_ROLE_PERIOD_END_REASONS)[number];

export type PartnerRolePeriodView = {
  id: string;
  partnerUserFacilityAccessId: string;
  partnerRole: OrganizationPartnerRole;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
  createdByAuthorityKind: PartnerAssignmentAuthorityKind;
  createdByOrganizationId: string | null;
  endedByAuthorityKind: PartnerAssignmentAuthorityKind | null;
  endedByOrganizationId: string | null;
  /** Null while the period is open, and on closed periods whose cause was never recorded. */
  endReason: PartnerUserRolePeriodEndReason | null;
};

export type RoleCeilingPeriodView = {
  id: string;
  facilityPartnerOrganizationId: string;
  maxPartnerRole: OrganizationPartnerRole;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
};

export type InternalFacilityAuthorization = {
  path: "internal";
  facilityId: string;
  facilityRole: RoleKey;
  allowedDepartmentIds: string[];
};

export type PartnerFacilityAuthorization = {
  path: "partner";
  facilityId: string;
  partnerOrganizationId: string;
  facilityPartnerOrganizationId: string;
  assignedRole: OrganizationPartnerRole;
  facilityRoleCeiling: OrganizationPartnerRole;
  effectiveRole: OrganizationPartnerRole;
  allowedDepartmentIds: string[];
};

export type FacilityAuthorization =
  | { path: "none" }
  | InternalFacilityAuthorization
  | PartnerFacilityAuthorization;

export type FacilityAuthorizationResult = {
  authorization: FacilityAuthorization;
  /**
   * Independent answers. Internal does not include partner Departments.
   * Partner does not include the Facility RoleKey. They are not unioned.
   */
  paths: {
    internal: InternalFacilityAuthorization | null;
    partner: PartnerFacilityAuthorization | null;
  };
  unversionedFacts: readonly UnversionedAuthorizationFact[];
};

export type PartnerRoleHistoryRow = PartnerRolePeriodView & {
  displayName: string;
};

export type PartnerAssignmentMemberView = {
  userId: string;
  email: string;
  displayName: string;
  organizationRole: OrganizationMembershipRole;
  assignmentId: string | null;
  assignedRole: OrganizationPartnerRole | null;
  effectiveRole: OrganizationPartnerRole | null;
  restricted: boolean;
  /** Facility-private. Do not copy this onto Organization-safe payloads. */
  restrictionNote: string | null;
  createdByAuthorityKind: PartnerAssignmentAuthorityKind | null;
};

export type AuthorizedPartnerFacility = {
  facilityId: string;
  facilityDisplayName: string;
  facilityPartnerOrganizationId: string;
  partnerOrganizationId: string;
  effectiveRole: OrganizationPartnerRole;
  departmentNames: string[];
};

/** User-global Path B listing. Same eligibility as the Organization-scoped list. */
export type AuthorizedPartnerFacilityForUser = AuthorizedPartnerFacility & {
  allowedDepartmentIds: string[];
  partnerOrganizationName: string;
};

export type PartnerUserAccessAdminView = {
  partnershipId: string;
  facilityId: string;
  organizationId: string;
  facilityDisplayName: string;
  staffingDelegationEnabled: boolean;
  currentCeiling: RoleCeilingPeriodView | null;
  ceilingPeriods: RoleCeilingPeriodView[];
  members: PartnerAssignmentMemberView[];
  rolePeriods: PartnerRoleHistoryRow[];
};

export class PartnerUserAccessError extends Error {
  readonly code:
    | "NOT_FACILITY_ADMINISTRATOR"
    | "PARTNERSHIP_NOT_FOUND"
    | "PARTNERSHIP_ENDED"
    | "PARTNERSHIP_INACTIVE"
    | "CEILING_ABSENT"
    | "ROLE_ABOVE_CEILING"
    | "USER_NOT_FOUND"
    | "USER_INACTIVE"
    | "ORGANIZATION_INACTIVE"
    | "NOT_CURRENT_MEMBER"
    | "SCOPE_EMPTY"
    | "ALREADY_ASSIGNED"
    | "ASSIGNMENT_NOT_CURRENT"
    | "OVERLAPPING_PERIOD"
    | "INVALID_INPUT"
    | "NOT_ORGANIZATION_ADMINISTRATOR"
    | "PARTNER_STAFFING_NOT_ENABLED"
    | "POLICY_ALREADY_ENABLED"
    | "POLICY_NOT_ENABLED"
    | "USER_RESTRICTED"
    | "ALREADY_RESTRICTED"
    | "RESTRICTION_NOT_CURRENT";

  constructor(code: PartnerUserAccessError["code"], message: string) {
    super(message);
    this.name = "PartnerUserAccessError";
    this.code = code;
  }
}
