-- LEG-02: a maintenance requirement can name a published Catalog form.
-- The old template columns stay until LEG-06.

ALTER TABLE "RepairRecordRequirement" ADD COLUMN "catalogDefinitionId" TEXT;
ALTER TABLE "RepairRecordRequirement" ADD COLUMN "catalogStableKey" TEXT;
ALTER TABLE "RepairRecordRequirement" ADD COLUMN "catalogVersion" INTEGER;

ALTER TABLE "PreventiveMaintenancePlanRecordRequirement" ADD COLUMN "catalogDefinitionId" TEXT;
ALTER TABLE "PreventiveMaintenancePlanRecordRequirement" ADD COLUMN "catalogStableKey" TEXT;
ALTER TABLE "PreventiveMaintenancePlanRecordRequirement" ADD COLUMN "catalogVersion" INTEGER;

CREATE INDEX "RepairRecordRequirement_catalogDefinitionId_idx" ON "RepairRecordRequirement"("catalogDefinitionId");
CREATE INDEX "PreventiveMaintenancePlanRecordRequirement_catalogDefinitionId_idx" ON "PreventiveMaintenancePlanRecordRequirement"("catalogDefinitionId");

ALTER TABLE "RepairRecordRequirement" ADD CONSTRAINT "RepairRecordRequirement_catalogDefinitionId_fkey" FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PreventiveMaintenancePlanRecordRequirement" ADD CONSTRAINT "PreventiveMaintenancePlanRecordRequirement_catalogDefinitionId_fkey" FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
