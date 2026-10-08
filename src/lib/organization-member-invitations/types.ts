import type {
  OrganizationMemberInvitationStatus,
  OrganizationMembershipRole,
} from "@prisma/client";

export type { OrganizationMemberInvitationStatus, OrganizationMembershipRole };

export type OrganizationMemberInvitationDisplayStatus =
  | OrganizationMemberInvitationStatus
  | "EXPIRED";

export type OrganizationMemberInvitationView = {
  id: string;
  organizationId: string;
  targetEmailNormalized: string;
  intendedRole: OrganizationMembershipRole;
  expiresAt: Date | null;
  status: OrganizationMemberInvitationStatus;
  displayStatus: OrganizationMemberInvitationDisplayStatus;
  invitedByUserId: string;
  acceptedByUserId: string | null;
  acceptedAt: Date | null;
  revokedByUserId: string | null;
  revokedAt: Date | null;
  lastInvitationDeliveredAt: Date | null;
  lastInvitationDeliveryStatus: string | null;
  lastInvitationDeliveryError: string | null;
  createdAt: Date;
  updatedAt: Date;
  isAcceptable: boolean;
};

export class OrganizationMemberInvitationError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "ORGANIZATION_INACTIVE"
    | "NOT_ORG_ADMIN"
    | "INVITATION_NOT_FOUND"
    | "INVITATION_NOT_PENDING"
    | "INVITATION_EXPIRED"
    | "INVITATION_REVOKED"
    | "TOKEN_INVALID"
    | "EMAIL_MISMATCH"
    | "ALREADY_CURRENT_MEMBER"
    | "ROLE_CHANGE_REQUIRES_ADMIN_ACTION"
    | "INVALID_INPUT"
    | "USER_INACTIVE";

  constructor(code: OrganizationMemberInvitationError["code"], message: string) {
    super(message);
    this.name = "OrganizationMemberInvitationError";
    this.code = code;
  }
}

export function organizationMemberInvitationDeliveryLabel(
  status: string | null | undefined,
): string | null {
  switch (status) {
    case "SENT":
      return "Sent";
    case "FAILED":
      return "Delivery failed";
    case "NOT_CONFIGURED":
      return "Not configured";
    default:
      return null;
  }
}
