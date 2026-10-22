-- CDA-05: link a maintainer to an Organization, record who pays, and accept a change of maintainer.

ALTER TABLE "FacilityOrganization" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "FacilityOrganization_organizationId_idx" ON "FacilityOrganization"("organizationId");
ALTER TABLE "FacilityOrganization" ADD CONSTRAINT "FacilityOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Vendor" ADD COLUMN "ownerOrganizationId" TEXT;
CREATE INDEX "Vendor_ownerOrganizationId_idx" ON "Vendor"("ownerOrganizationId");
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_ownerOrganizationId_fkey" FOREIGN KEY ("ownerOrganizationId") REFERENCES "FacilityOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Repair" ADD COLUMN "payerOrganizationId" TEXT;
CREATE INDEX "Repair_payerOrganizationId_idx" ON "Repair"("payerOrganizationId");
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_payerOrganizationId_fkey" FOREIGN KEY ("payerOrganizationId") REFERENCES "FacilityOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "AssetMaintainerProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

CREATE TABLE "AssetMaintainerProposal" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "facilityOrganizationId" TEXT NOT NULL,
    "proposedByUserId" TEXT,
    "status" "AssetMaintainerProposalStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetMaintainerProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssetMaintainerProposal_assetId_status_idx" ON "AssetMaintainerProposal"("assetId", "status");
CREATE INDEX "AssetMaintainerProposal_facilityOrganizationId_idx" ON "AssetMaintainerProposal"("facilityOrganizationId");
CREATE INDEX "AssetMaintainerProposal_proposedByUserId_idx" ON "AssetMaintainerProposal"("proposedByUserId");
CREATE INDEX "AssetMaintainerProposal_acceptedByUserId_idx" ON "AssetMaintainerProposal"("acceptedByUserId");

CREATE UNIQUE INDEX "AssetMaintainerProposal_one_pending"
  ON "AssetMaintainerProposal"("assetId")
  WHERE "status" = 'PENDING';

ALTER TABLE "AssetMaintainerProposal" ADD CONSTRAINT "AssetMaintainerProposal_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetMaintainerProposal" ADD CONSTRAINT "AssetMaintainerProposal_facilityOrganizationId_fkey" FOREIGN KEY ("facilityOrganizationId") REFERENCES "FacilityOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetMaintainerProposal" ADD CONSTRAINT "AssetMaintainerProposal_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetMaintainerProposal" ADD CONSTRAINT "AssetMaintainerProposal_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
