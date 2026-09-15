-- Facility-scoped organizations responsible for asset maintenance/repair
-- (distinct from platform Organization tenancy and from Vendor service providers).

CREATE TABLE "FacilityOrganization" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityOrganization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacilityOrganization_facilityId_name_key" ON "FacilityOrganization"("facilityId", "name");

CREATE INDEX "FacilityOrganization_facilityId_isActive_idx" ON "FacilityOrganization"("facilityId", "isActive");

ALTER TABLE "FacilityOrganization" ADD CONSTRAINT "FacilityOrganization_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Optional primary responsible organization on Asset
ALTER TABLE "Asset" ADD COLUMN "responsibleOrganizationId" TEXT;

CREATE INDEX "Asset_responsibleOrganizationId_idx" ON "Asset"("responsibleOrganizationId");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_responsibleOrganizationId_fkey" FOREIGN KEY ("responsibleOrganizationId") REFERENCES "FacilityOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
