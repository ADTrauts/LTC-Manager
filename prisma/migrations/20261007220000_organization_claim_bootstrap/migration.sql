-- Phase 2B2: Organization first-admin claim bootstrap.
-- Additive claim workflow only. No backfill. Does not grant Facility access.

-- CreateEnum
CREATE TYPE "OrganizationClaimStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'REVOKED', 'ACCEPTED');

-- CreateTable
CREATE TABLE "OrganizationClaimInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "targetEmailNormalized" TEXT NOT NULL,
    "contactName" TEXT,
    "notes" TEXT,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" "OrganizationClaimStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByUserId" TEXT,
    "requestedFromFacilityId" TEXT,
    "approvedByPlatformStaffId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedByPlatformStaffId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "revokedByPlatformStaffId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationClaimInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationClaimInvitation_tokenHash_key" ON "OrganizationClaimInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizationClaimInvitation_organizationId_status_idx" ON "OrganizationClaimInvitation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrganizationClaimInvitation_targetEmailNormalized_idx" ON "OrganizationClaimInvitation"("targetEmailNormalized");

-- CreateIndex
CREATE INDEX "OrganizationClaimInvitation_requestedFromFacilityId_idx" ON "OrganizationClaimInvitation"("requestedFromFacilityId");

-- CreateIndex
CREATE INDEX "OrganizationClaimInvitation_requestedByUserId_idx" ON "OrganizationClaimInvitation"("requestedByUserId");

-- CreateIndex
CREATE INDEX "OrganizationClaimInvitation_status_expiresAt_idx" ON "OrganizationClaimInvitation"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_requestedFromFacilityId_fkey" FOREIGN KEY ("requestedFromFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_approvedByPlatformStaffId_fkey" FOREIGN KEY ("approvedByPlatformStaffId") REFERENCES "PlatformStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_rejectedByPlatformStaffId_fkey" FOREIGN KEY ("rejectedByPlatformStaffId") REFERENCES "PlatformStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_revokedByPlatformStaffId_fkey" FOREIGN KEY ("revokedByPlatformStaffId") REFERENCES "PlatformStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
