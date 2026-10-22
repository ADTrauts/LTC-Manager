-- CDA-05: a Catalog form can belong to Vssyl, a facility, or a vendor organization.

CREATE TYPE "CatalogFormOwnerKind" AS ENUM ('VSSYL', 'FACILITY', 'ORGANIZATION');

ALTER TABLE "CatalogLogDefinition" ADD COLUMN "ownerKind" "CatalogFormOwnerKind" NOT NULL DEFAULT 'VSSYL';
ALTER TABLE "CatalogLogDefinition" ADD COLUMN "ownerFacilityId" TEXT;
ALTER TABLE "CatalogLogDefinition" ADD COLUMN "ownerOrganizationId" TEXT;

CREATE INDEX "CatalogLogDefinition_ownerKind_ownerOrganizationId_idx" ON "CatalogLogDefinition"("ownerKind", "ownerOrganizationId");
CREATE INDEX "CatalogLogDefinition_ownerFacilityId_idx" ON "CatalogLogDefinition"("ownerFacilityId");

ALTER TABLE "CatalogLogDefinition" ADD CONSTRAINT "CatalogLogDefinition_ownerFacilityId_fkey" FOREIGN KEY ("ownerFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CatalogLogDefinition" ADD CONSTRAINT "CatalogLogDefinition_ownerOrganizationId_fkey" FOREIGN KEY ("ownerOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
