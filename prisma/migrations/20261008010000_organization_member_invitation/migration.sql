-- Phase 2B3: Organization member invitations.
-- Additive only. Does not grant Facility access.

CREATE TYPE "OrganizationMemberInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

CREATE TABLE "OrganizationMemberInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "targetEmailNormalized" TEXT NOT NULL,
    "intendedRole" "OrganizationMembershipRole" NOT NULL,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" "OrganizationMemberInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "lastInvitationDeliveredAt" TIMESTAMP(3),
    "lastInvitationDeliveryStatus" TEXT,
    "lastInvitationDeliveryError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMemberInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationMemberInvitation_tokenHash_key" ON "OrganizationMemberInvitation"("tokenHash");
CREATE INDEX "OrganizationMemberInvitation_organizationId_status_idx" ON "OrganizationMemberInvitation"("organizationId", "status");
CREATE INDEX "OrganizationMemberInvitation_organizationId_targetEmailNormalized_status_idx" ON "OrganizationMemberInvitation"("organizationId", "targetEmailNormalized", "status");
CREATE INDEX "OrganizationMemberInvitation_targetEmailNormalized_idx" ON "OrganizationMemberInvitation"("targetEmailNormalized");
CREATE INDEX "OrganizationMemberInvitation_invitedByUserId_idx" ON "OrganizationMemberInvitation"("invitedByUserId");
CREATE INDEX "OrganizationMemberInvitation_status_expiresAt_idx" ON "OrganizationMemberInvitation"("status", "expiresAt");

ALTER TABLE "OrganizationMemberInvitation" ADD CONSTRAINT "OrganizationMemberInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationMemberInvitation" ADD CONSTRAINT "OrganizationMemberInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationMemberInvitation" ADD CONSTRAINT "OrganizationMemberInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrganizationMemberInvitation" ADD CONSTRAINT "OrganizationMemberInvitation_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
