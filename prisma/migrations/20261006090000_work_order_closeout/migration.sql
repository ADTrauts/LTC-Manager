-- Phase 3D: Work Order closeout facts on Repair.
-- Additive only. No historical backfill. No rewrite of completed rows.

CREATE TYPE "RepairAssetConditionReview" AS ENUM (
  'NO_CHANGE',
  'OPERATIONAL',
  'DEGRADED',
  'OUT_OF_SERVICE'
);

CREATE TYPE "RepairRecordRequirementStatus" AS ENUM (
  'PENDING',
  'SATISFIED',
  'WAIVED'
);

ALTER TABLE "Repair" ADD COLUMN "externalCost" DECIMAL(12,2);
ALTER TABLE "Repair" ADD COLUMN "externalCostNote" TEXT;
ALTER TABLE "Repair" ADD COLUMN "assetConditionReview" "RepairAssetConditionReview";
ALTER TABLE "Repair" ADD COLUMN "assetConditionReviewedAt" TIMESTAMP(3);
ALTER TABLE "Repair" ADD COLUMN "assetConditionReviewedByUserId" TEXT;

CREATE INDEX "Repair_assetConditionReviewedByUserId_idx"
ON "Repair"("assetConditionReviewedByUserId");

ALTER TABLE "Repair"
ADD CONSTRAINT "Repair_assetConditionReviewedByUserId_fkey"
FOREIGN KEY ("assetConditionReviewedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RepairLaborEntry" (
  "id" TEXT NOT NULL,
  "repairId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "note" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedByUserId" TEXT,

  CONSTRAINT "RepairLaborEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RepairLaborEntry_repairId_idx" ON "RepairLaborEntry"("repairId");
CREATE INDEX "RepairLaborEntry_employeeId_idx" ON "RepairLaborEntry"("employeeId");
CREATE INDEX "RepairLaborEntry_recordedByUserId_idx" ON "RepairLaborEntry"("recordedByUserId");

ALTER TABLE "RepairLaborEntry"
ADD CONSTRAINT "RepairLaborEntry_repairId_fkey"
FOREIGN KEY ("repairId") REFERENCES "Repair"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RepairLaborEntry"
ADD CONSTRAINT "RepairLaborEntry_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RepairLaborEntry"
ADD CONSTRAINT "RepairLaborEntry_recordedByUserId_fkey"
FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RepairPartUsed" (
  "id" TEXT NOT NULL,
  "repairId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "partNumber" TEXT,
  "quantity" DECIMAL(12,3) NOT NULL,
  "lineCost" DECIMAL(12,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT,

  CONSTRAINT "RepairPartUsed_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RepairPartUsed_repairId_idx" ON "RepairPartUsed"("repairId");
CREATE INDEX "RepairPartUsed_createdByUserId_idx" ON "RepairPartUsed"("createdByUserId");

ALTER TABLE "RepairPartUsed"
ADD CONSTRAINT "RepairPartUsed_repairId_fkey"
FOREIGN KEY ("repairId") REFERENCES "Repair"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RepairPartUsed"
ADD CONSTRAINT "RepairPartUsed_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RepairRecordRequirement" (
  "id" TEXT NOT NULL,
  "repairId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "templateStableKey" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "templateName" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "RepairRecordRequirementStatus" NOT NULL DEFAULT 'PENDING',
  "satisfiedByRecordId" TEXT,
  "waivedAt" TIMESTAMP(3),
  "waivedByUserId" TEXT,
  "waiveReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT,

  CONSTRAINT "RepairRecordRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepairRecordRequirement_repairId_templateId_key"
ON "RepairRecordRequirement"("repairId", "templateId");
CREATE INDEX "RepairRecordRequirement_repairId_status_idx"
ON "RepairRecordRequirement"("repairId", "status");
CREATE INDEX "RepairRecordRequirement_templateId_idx"
ON "RepairRecordRequirement"("templateId");
CREATE INDEX "RepairRecordRequirement_satisfiedByRecordId_idx"
ON "RepairRecordRequirement"("satisfiedByRecordId");
CREATE INDEX "RepairRecordRequirement_waivedByUserId_idx"
ON "RepairRecordRequirement"("waivedByUserId");
CREATE INDEX "RepairRecordRequirement_createdByUserId_idx"
ON "RepairRecordRequirement"("createdByUserId");

ALTER TABLE "RepairRecordRequirement"
ADD CONSTRAINT "RepairRecordRequirement_repairId_fkey"
FOREIGN KEY ("repairId") REFERENCES "Repair"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RepairRecordRequirement"
ADD CONSTRAINT "RepairRecordRequirement_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "OperationalTemplate"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RepairRecordRequirement"
ADD CONSTRAINT "RepairRecordRequirement_satisfiedByRecordId_fkey"
FOREIGN KEY ("satisfiedByRecordId") REFERENCES "OperationalEvidenceRecord"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RepairRecordRequirement"
ADD CONSTRAINT "RepairRecordRequirement_waivedByUserId_fkey"
FOREIGN KEY ("waivedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RepairRecordRequirement"
ADD CONSTRAINT "RepairRecordRequirement_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
