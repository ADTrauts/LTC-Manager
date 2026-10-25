-- LEG-02: a maintenance requirement can name a Catalog form without a template.
-- The template columns stay until LEG-06.

ALTER TABLE "PreventiveMaintenancePlanRecordRequirement" ALTER COLUMN "templateId" DROP NOT NULL;
ALTER TABLE "PreventiveMaintenancePlanRecordRequirement" ALTER COLUMN "templateStableKey" DROP NOT NULL;
ALTER TABLE "PreventiveMaintenancePlanRecordRequirement" ALTER COLUMN "templateVersion" DROP NOT NULL;
ALTER TABLE "PreventiveMaintenancePlanRecordRequirement" ALTER COLUMN "templateName" DROP NOT NULL;

ALTER TABLE "RepairRecordRequirement" ALTER COLUMN "templateId" DROP NOT NULL;
ALTER TABLE "RepairRecordRequirement" ALTER COLUMN "templateStableKey" DROP NOT NULL;
ALTER TABLE "RepairRecordRequirement" ALTER COLUMN "templateVersion" DROP NOT NULL;
ALTER TABLE "RepairRecordRequirement" ALTER COLUMN "templateName" DROP NOT NULL;

CREATE UNIQUE INDEX "PreventiveMaintenancePlanRecordRequirement_planVersionId_catalogDefinitionId_key" ON "PreventiveMaintenancePlanRecordRequirement"("planVersionId", "catalogDefinitionId");
CREATE UNIQUE INDEX "RepairRecordRequirement_repairId_catalogDefinitionId_key" ON "RepairRecordRequirement"("repairId", "catalogDefinitionId");
