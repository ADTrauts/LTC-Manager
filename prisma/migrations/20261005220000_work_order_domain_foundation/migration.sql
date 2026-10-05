-- Phase 3B: canonical Work Order domain foundation on Repair.
-- Persistence name stays Repair. Additive only. No historical space/procedure rewrite.

-- Emergency is a new stored priority. LOW/MEDIUM remain stored.
ALTER TYPE "RepairPriority" ADD VALUE IF NOT EXISTS 'EMERGENCY';

-- Canonical hold reason for new ON_HOLD writes.
CREATE TYPE "WorkOrderHoldReason" AS ENUM (
  'WAITING_FOR_PART',
  'WAITING_FOR_VENDOR',
  'WAITING_FOR_ACCESS',
  'SCHEDULED_LATER',
  'OTHER'
);

-- Facility-scoped maintenance categories. Not Asset class. Not RepairTrade.
CREATE TABLE "MaintenanceCategory" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MaintenanceCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaintenanceCategory_facilityId_key_key" ON "MaintenanceCategory"("facilityId", "key");
CREATE INDEX "MaintenanceCategory_facilityId_archivedAt_idx" ON "MaintenanceCategory"("facilityId", "archivedAt");

ALTER TABLE "MaintenanceCategory"
  ADD CONSTRAINT "MaintenanceCategory_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Work Order occurrence Room, Procedure pin, hold reason, category.
ALTER TABLE "Repair" ADD COLUMN "spaceId" TEXT;
ALTER TABLE "Repair" ADD COLUMN "holdReason" "WorkOrderHoldReason";
ALTER TABLE "Repair" ADD COLUMN "procedureVersionId" TEXT;
ALTER TABLE "Repair" ADD COLUMN "maintenanceCategoryId" TEXT;

CREATE INDEX "Repair_spaceId_idx" ON "Repair"("spaceId");
CREATE INDEX "Repair_procedureVersionId_idx" ON "Repair"("procedureVersionId");
CREATE INDEX "Repair_maintenanceCategoryId_idx" ON "Repair"("maintenanceCategoryId");

ALTER TABLE "Repair"
  ADD CONSTRAINT "Repair_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Repair"
  ADD CONSTRAINT "Repair_procedureVersionId_fkey"
  FOREIGN KEY ("procedureVersionId") REFERENCES "KnowledgeArticleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Repair"
  ADD CONSTRAINT "Repair_maintenanceCategoryId_fkey"
  FOREIGN KEY ("maintenanceCategoryId") REFERENCES "MaintenanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Incidental Record links. Not a required-closeout gate.
CREATE TABLE "RepairEvidenceLink" (
  "id" TEXT NOT NULL,
  "repairId" TEXT NOT NULL,
  "evidenceRecordId" TEXT NOT NULL,
  "linkedByUserId" TEXT,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,

  CONSTRAINT "RepairEvidenceLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepairEvidenceLink_repairId_evidenceRecordId_key" ON "RepairEvidenceLink"("repairId", "evidenceRecordId");
CREATE INDEX "RepairEvidenceLink_evidenceRecordId_idx" ON "RepairEvidenceLink"("evidenceRecordId");

ALTER TABLE "RepairEvidenceLink"
  ADD CONSTRAINT "RepairEvidenceLink_repairId_fkey"
  FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RepairEvidenceLink"
  ADD CONSTRAINT "RepairEvidenceLink_evidenceRecordId_fkey"
  FOREIGN KEY ("evidenceRecordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RepairEvidenceLink"
  ADD CONSTRAINT "RepairEvidenceLink_linkedByUserId_fkey"
  FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
