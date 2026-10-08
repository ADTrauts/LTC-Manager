import type { OrganizationMemberInvitationStatus, OrganizationMembershipRole } from "@prisma/client";

import type {
  OrganizationMemberInvitationDisplayStatus,
  OrganizationMemberInvitationView,
} from "./types";

type InvitationRow = {
  id: string;
  organizationId: string;
  targetEmailNormalized: string;
  intendedRole: OrganizationMembershipRole;
  expiresAt: Date | null;
  status: OrganizationMemberInvitationStatus;
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
};

export function deriveMemberInvitationDisplayStatus(
  row: Pick<InvitationRow, "status" | "expiresAt" | "acceptedAt" | "revokedAt">,
  now: Date = new Date(),
): OrganizationMemberInvitationDisplayStatus {
  if (
    row.status === "PENDING" &&
    row.acceptedAt == null &&
    row.revokedAt == null &&
    row.expiresAt != null &&
    row.expiresAt.getTime() <= now.getTime()
  ) {
    return "EXPIRED";
  }
  return row.status;
}

export function isAcceptableMemberInvitation(
  row: Pick<InvitationRow, "status" | "expiresAt" | "acceptedAt" | "revokedAt">,
  now: Date = new Date(),
): boolean {
  return (
    row.status === "PENDING" &&
    row.acceptedAt == null &&
    row.revokedAt == null &&
    row.expiresAt != null &&
    row.expiresAt.getTime() > now.getTime()
  );
}

export function toMemberInvitationView(
  row: InvitationRow,
  now: Date = new Date(),
): OrganizationMemberInvitationView {
  const displayStatus = deriveMemberInvitationDisplayStatus(row, now);
  return {
    ...row,
    displayStatus,
    isAcceptable: isAcceptableMemberInvitation(row, now),
  };
}
