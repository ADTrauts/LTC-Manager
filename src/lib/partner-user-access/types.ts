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

export type PartnerRolePeriodView = {
  id: string;
  partnerUserFacilityAccessId: string;
  partnerRole: OrganizationPartnerRole;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
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
};

export type PartnerUserAccessAdminView = {
  partnershipId: string;
  facilityId: string;
  organizationId: string;
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
    | "INVALID_INPUT";

  constructor(code: PartnerUserAccessError["code"], message: string) {
    super(message);
    this.name = "PartnerUserAccessError";
    this.code = code;
  }
}
