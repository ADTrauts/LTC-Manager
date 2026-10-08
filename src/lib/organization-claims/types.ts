import type { OrganizationClaimStatus } from "@prisma/client";

export type { OrganizationClaimStatus };

/** Derived Organization administrative claim display state (not persisted). */
export type OrganizationClaimDisplayState =
  | "UNCLAIMED"
  | "CLAIM_PENDING"
  | "ADMINISTRABLE";

/** Derived invitation display including temporal expiration. */
export type OrganizationClaimInvitationDisplayStatus =
  | OrganizationClaimStatus
  | "EXPIRED";

export type OrganizationClaimInvitationView = {
  id: string;
  organizationId: string;
  targetEmailNormalized: string;
  contactName: string | null;
  notes: string | null;
  status: OrganizationClaimStatus;
  displayStatus: OrganizationClaimInvitationDisplayStatus;
  expiresAt: Date | null;
  requestedByUserId: string | null;
  requestedFromFacilityId: string | null;
  approvedByPlatformStaffId: string | null;
  approvedAt: Date | null;
  rejectedByPlatformStaffId: string | null;
  rejectedAt: Date | null;
  revokedByPlatformStaffId: string | null;
  revokedAt: Date | null;
  acceptedByUserId: string | null;
  acceptedAt: Date | null;
  lastInvitationDeliveredAt: Date | null;
  lastInvitationDeliveryStatus: string | null;
  lastInvitationDeliveryError: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** True when status is APPROVED, not expired, not revoked, not accepted. */
  isClaimable: boolean;
};

export type OrganizationClaimDeliveryStatus =
  | "SENT"
  | "FAILED"
  | "NOT_CONFIGURED";

export type OrganizationClaimStateView = {
  organizationId: string;
  organizationActive: boolean;
  currentOrgAdminCount: number;
  displayState: OrganizationClaimDisplayState;
  openClaims: OrganizationClaimInvitationView[];
};

export class OrganizationClaimError extends Error {
  readonly code:
    | "ORGANIZATION_NOT_FOUND"
    | "ORGANIZATION_INACTIVE"
    | "ALREADY_ADMINISTRABLE"
    | "PARTNERSHIP_REQUIRED"
    | "PARTNERSHIP_ENDED"
    | "PARTNERSHIP_NOT_FOUND"
    | "CLAIM_NOT_FOUND"
    | "CLAIM_NOT_REQUESTED"
    | "CLAIM_NOT_APPROVED"
    | "CLAIM_EXPIRED"
    | "CLAIM_REVOKED"
    | "CLAIM_ALREADY_ACCEPTED"
    | "CLAIM_TERMINAL"
    | "APPROVED_CLAIM_EXISTS"
    | "TOKEN_INVALID"
    | "EMAIL_MISMATCH"
    | "USER_INACTIVE"
    | "INVALID_INPUT"
    | "FORBIDDEN";

  constructor(code: OrganizationClaimError["code"], message: string) {
    super(message);
    this.name = "OrganizationClaimError";
    this.code = code;
  }
}

export function organizationClaimDisplayStateLabel(
  state: OrganizationClaimDisplayState,
): string {
  switch (state) {
    case "UNCLAIMED":
      return "Unclaimed";
    case "CLAIM_PENDING":
      return "Claim pending";
    case "ADMINISTRABLE":
      return "Administrable";
  }
}

export function organizationClaimInvitationStatusLabel(
  status: OrganizationClaimInvitationDisplayStatus,
): string {
  switch (status) {
    case "REQUESTED":
      return "Requested";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "REVOKED":
      return "Revoked";
    case "ACCEPTED":
      return "Accepted";
    case "EXPIRED":
      return "Expired";
  }
}

export function organizationClaimDeliveryStatusLabel(
  status: string | null | undefined,
): string | null {
  switch (status) {
    case "SENT":
      return "Invitation sent";
    case "FAILED":
      return "Delivery failed";
    case "NOT_CONFIGURED":
      return "Delivery not configured";
    default:
      return null;
  }
}
