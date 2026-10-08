-- Phase 2B closeout: Harbor-visible claim invitation delivery status.
-- Additive only. Does not grant authority.

-- AlterTable
ALTER TABLE "OrganizationClaimInvitation" ADD COLUMN "lastInvitationDeliveredAt" TIMESTAMP(3);
ALTER TABLE "OrganizationClaimInvitation" ADD COLUMN "lastInvitationDeliveryStatus" TEXT;
ALTER TABLE "OrganizationClaimInvitation" ADD COLUMN "lastInvitationDeliveryError" TEXT;
