import type { OrganizationClaimStatus } from "@prisma/client";

import type {
  OrganizationClaimDisplayState,
  OrganizationClaimInvitationDisplayStatus,
  OrganizationClaimInvitationView,
} from "./types";

type ClaimRow = {
  id: string;
  organizationId: string;
  targetEmailNormalized: string;
  contactName: string | null;
  notes: string | null;
  status: OrganizationClaimStatus;
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
};

export function deriveInvitationDisplayStatus(
  row: Pick<ClaimRow, "status" | "expiresAt" | "acceptedAt" | "revokedAt">,
  now: Date = new Date(),
): OrganizationClaimInvitationDisplayStatus {
  if (
    row.status === "APPROVED" &&
    row.acceptedAt == null &&
    row.revokedAt == null &&
    row.expiresAt != null &&
    row.expiresAt.getTime() <= now.getTime()
  ) {
    return "EXPIRED";
  }
  return row.status;
}

export function isLiveClaimWorkflow(
  row: Pick<ClaimRow, "status" | "expiresAt" | "acceptedAt" | "revokedAt">,
  now: Date = new Date(),
): boolean {
  if (row.status === "REQUESTED") return true;
  if (row.status !== "APPROVED") return false;
  return deriveInvitationDisplayStatus(row, now) === "APPROVED";
}

export function isClaimableInvitation(
  row: Pick<ClaimRow, "status" | "expiresAt" | "acceptedAt" | "revokedAt">,
  now: Date = new Date(),
): boolean {
  return (
    row.status === "APPROVED" &&
    row.acceptedAt == null &&
    row.revokedAt == null &&
    row.expiresAt != null &&
    row.expiresAt.getTime() > now.getTime()
  );
}

export function toClaimInvitationView(
  row: ClaimRow,
  now: Date = new Date(),
): OrganizationClaimInvitationView {
  const displayStatus = deriveInvitationDisplayStatus(row, now);
  return {
    id: row.id,
    organizationId: row.organizationId,
    targetEmailNormalized: row.targetEmailNormalized,
    contactName: row.contactName,
    notes: row.notes,
    status: row.status,
    displayStatus,
    expiresAt: row.expiresAt,
    requestedByUserId: row.requestedByUserId,
    requestedFromFacilityId: row.requestedFromFacilityId,
    approvedByPlatformStaffId: row.approvedByPlatformStaffId,
    approvedAt: row.approvedAt,
    rejectedByPlatformStaffId: row.rejectedByPlatformStaffId,
    rejectedAt: row.rejectedAt,
    revokedByPlatformStaffId: row.revokedByPlatformStaffId,
    revokedAt: row.revokedAt,
    acceptedByUserId: row.acceptedByUserId,
    acceptedAt: row.acceptedAt,
    lastInvitationDeliveredAt: row.lastInvitationDeliveredAt,
    lastInvitationDeliveryStatus: row.lastInvitationDeliveryStatus,
    lastInvitationDeliveryError: row.lastInvitationDeliveryError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isClaimable: isClaimableInvitation(row, now),
  };
}

export function deriveOrganizationClaimDisplayState(input: {
  currentOrgAdminCount: number;
  openClaims: Array<Pick<ClaimRow, "status" | "expiresAt" | "acceptedAt" | "revokedAt">>;
  now?: Date;
}): OrganizationClaimDisplayState {
  if (input.currentOrgAdminCount > 0) return "ADMINISTRABLE";
  const now = input.now ?? new Date();
  if (input.openClaims.some((claim) => isLiveClaimWorkflow(claim, now))) {
    return "CLAIM_PENDING";
  }
  return "UNCLAIMED";
}
