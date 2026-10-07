import type { OrganizationMembershipRole } from "@prisma/client";

export type { OrganizationMembershipRole };

export type OrganizationMembershipRolePeriodView = {
  id: string;
  membershipId: string;
  role: OrganizationMembershipRole;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OrganizationMembershipView = {
  id: string;
  userId: string;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    displayName: string | null;
    legalName: string | null;
    organizationType: string | null;
    isActive: boolean;
  };
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  currentRole: OrganizationMembershipRole | null;
  currentRolePeriod: OrganizationMembershipRolePeriodView | null;
  rolePeriods: OrganizationMembershipRolePeriodView[];
};

export class OrganizationMembershipError extends Error {
  readonly code:
    | "ORGANIZATION_NOT_FOUND"
    | "ORGANIZATION_INACTIVE"
    | "USER_NOT_FOUND"
    | "USER_INACTIVE"
    | "INVALID_USER_IDENTITY"
    | "MEMBERSHIP_NOT_FOUND"
    | "ALREADY_ACTIVE_MEMBER"
    | "NOT_ACTIVE_MEMBER"
    | "OVERLAPPING_PERIOD"
    | "INVALID_INPUT";

  constructor(code: OrganizationMembershipError["code"], message: string) {
    super(message);
    this.name = "OrganizationMembershipError";
    this.code = code;
  }
}

export function organizationMembershipRoleLabel(role: OrganizationMembershipRole): string {
  switch (role) {
    case "ORG_ADMIN":
      return "Organization Administrator";
    case "ORG_MEMBER":
      return "Organization Member";
  }
}

export function organizationDisplayLabel(organization: {
  name: string;
  displayName: string | null;
}): string {
  const display = organization.displayName?.trim();
  if (display) return display;
  return organization.name;
}
