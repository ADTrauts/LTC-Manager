-- CDA-08 / CDA-D22: asset title, and a facility note when partner-titled equipment leaves.
CREATE TYPE "AssetTitleKind" AS ENUM ('FACILITY', 'PARTNER');

ALTER TABLE "Asset" ADD COLUMN "titleKind" "AssetTitleKind" NOT NULL DEFAULT 'FACILITY';
ALTER TABLE "Asset" ADD COLUMN "titleOrganizationId" TEXT;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_titleOrganizationId_fkey"
  FOREIGN KEY ("titleOrganizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Asset_titleOrganizationId_idx" ON "Asset"("titleOrganizationId");

CREATE TABLE "AssetPresenceNote" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "equipmentType" TEXT NOT NULL,
  "onSiteFrom" DATE NOT NULL,
  "onSiteTo" DATE NOT NULL,
  "titleOrganizationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetPresenceNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AssetPresenceNote"
  ADD CONSTRAINT "AssetPresenceNote_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetPresenceNote"
  ADD CONSTRAINT "AssetPresenceNote_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetPresenceNote"
  ADD CONSTRAINT "AssetPresenceNote_titleOrganizationId_fkey"
  FOREIGN KEY ("titleOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AssetPresenceNote_facilityId_departmentId_idx" ON "AssetPresenceNote"("facilityId", "departmentId");
CREATE INDEX "AssetPresenceNote_titleOrganizationId_idx" ON "AssetPresenceNote"("titleOrganizationId");
