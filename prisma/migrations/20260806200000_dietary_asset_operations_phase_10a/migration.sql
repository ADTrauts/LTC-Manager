-- Phase 10A: Dietary Asset Operations (Assets, Issues, Work Orders).
-- Additive only. Safe on empty DB and existing data.
-- Does not modify ltc_manager. Does not activate OPERATION_ENGINE_ENABLED.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "AssetStatusChangeReason" AS ENUM (
  'INITIAL',
  'MANUAL',
  'TRIAGE',
  'RETURN_TO_SERVICE',
  'RETIREMENT',
  'CORRECTION'
);

CREATE TYPE "AssetIssueStatus" AS ENUM (
  'REPORTED',
  'ACKNOWLEDGED',
  'TRIAGED',
  'MONITORING',
  'RESOLVED',
  'CLOSED',
  'CANCELLED'
);

CREATE TYPE "AssetOperationalImpact" AS ENUM (
  'NO_IMMEDIATE_IMPACT',
  'WORKAROUND_AVAILABLE',
  'SERVICE_AT_RISK',
  'EQUIPMENT_UNAVAILABLE'
);

ALTER TYPE "AssetStatus" ADD VALUE IF NOT EXISTS 'OPERATIONAL';
ALTER TYPE "AssetStatus" ADD VALUE IF NOT EXISTS 'DEGRADED';

ALTER TYPE "RepairStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "RepairStatus" ADD VALUE IF NOT EXISTS 'WAITING_ON_VENDOR';
ALTER TYPE "RepairStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';
ALTER TYPE "RepairStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "RepairStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ---------------------------------------------------------------------------
-- Asset identity / lifecycle columns
-- ---------------------------------------------------------------------------

ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "spaceId" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "manufacturer" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "facilityAssetNumber" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "procedureInstructions" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "inServiceDate" DATE;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "warrantyExpiresAt" DATE;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "retiredReason" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "lastChangedByUserId" TEXT;

-- OPERATIONAL / DEGRADED enum values are added above. Data backfill and default
-- change run in the companion migration (PG cannot use new enum values until commit).

-- ---------------------------------------------------------------------------
-- Work Order (Repair) lifecycle columns
-- ---------------------------------------------------------------------------

ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "targetDate" TIMESTAMP(3);
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "workPerformed" TEXT;
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "resolution" TEXT;
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "followUpRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "followUpNote" TEXT;
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "returnToServiceReady" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Repair" SET "requestedAt" = "createdAt" WHERE "requestedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- Offline receipt linkage
-- ---------------------------------------------------------------------------

ALTER TABLE "OfflineSyncReceipt" ADD COLUMN IF NOT EXISTS "assetIssueId" TEXT;

-- ---------------------------------------------------------------------------
-- Asset Issue (reported condition — separate from Repair / Work Order)
-- ---------------------------------------------------------------------------

CREATE TABLE "AssetIssue" (
    "id" TEXT NOT NULL,
    "issueCode" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "spaceId" TEXT,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AssetIssueStatus" NOT NULL DEFAULT 'REPORTED',
    "priority" "RepairPriority" NOT NULL DEFAULT 'MEDIUM',
    "operationalImpact" "AssetOperationalImpact" NOT NULL DEFAULT 'NO_IMMEDIATE_IMPACT',
    "equipmentRemainsUsable" BOOLEAN NOT NULL DEFAULT true,
    "workaroundInstruction" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synchronizedAt" TIMESTAMP(3),
    "recordedOnline" BOOLEAN NOT NULL DEFAULT true,
    "clientCommandId" TEXT,
    "deviceBoundUnitId" TEXT,
    "reportedByUserId" TEXT,
    "reportedByEmployeeId" TEXT,
    "reportedByLabel" TEXT,
    "triageNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "resolutionReason" TEXT,
    "workOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetIssueUpdate" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "updateText" TEXT NOT NULL,
    "statusAfterUpdate" "AssetIssueStatus",
    "updatedByUserId" TEXT,
    "updatedByEmployeeId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetIssueUpdate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetIssueEvidenceLink" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "evidenceRecordId" TEXT NOT NULL,
    "linkedByUserId" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "AssetIssueEvidenceLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetStatusHistory" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fromStatus" "AssetStatus",
    "toStatus" "AssetStatus" NOT NULL,
    "reason" "AssetStatusChangeReason" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "changedByUserId" TEXT,
    "sourceIssueId" TEXT,
    "sourceRepairId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetStatusHistory_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Indexes and uniqueness
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "AssetIssue_issueCode_key" ON "AssetIssue"("issueCode");
CREATE UNIQUE INDEX "AssetIssue_workOrderId_key" ON "AssetIssue"("workOrderId");
CREATE UNIQUE INDEX "AssetIssue_facilityId_departmentId_clientCommandId_key"
  ON "AssetIssue"("facilityId", "departmentId", "clientCommandId");

CREATE INDEX "AssetIssue_facilityId_departmentId_status_idx"
  ON "AssetIssue"("facilityId", "departmentId", "status");
CREATE INDEX "AssetIssue_facilityId_assetId_status_idx"
  ON "AssetIssue"("facilityId", "assetId", "status");
CREATE INDEX "AssetIssue_facilityId_unitId_status_idx"
  ON "AssetIssue"("facilityId", "unitId", "status");
CREATE INDEX "AssetIssue_priority_status_idx" ON "AssetIssue"("priority", "status");
CREATE INDEX "AssetIssue_observedAt_idx" ON "AssetIssue"("observedAt");

CREATE INDEX "AssetIssueUpdate_issueId_updatedAt_idx"
  ON "AssetIssueUpdate"("issueId", "updatedAt");

CREATE UNIQUE INDEX "AssetIssueEvidenceLink_issueId_evidenceRecordId_key"
  ON "AssetIssueEvidenceLink"("issueId", "evidenceRecordId");
CREATE INDEX "AssetIssueEvidenceLink_evidenceRecordId_idx"
  ON "AssetIssueEvidenceLink"("evidenceRecordId");

CREATE INDEX "AssetStatusHistory_assetId_changedAt_idx"
  ON "AssetStatusHistory"("assetId", "changedAt");
CREATE INDEX "AssetStatusHistory_sourceIssueId_idx" ON "AssetStatusHistory"("sourceIssueId");
CREATE INDEX "AssetStatusHistory_sourceRepairId_idx" ON "AssetStatusHistory"("sourceRepairId");

CREATE INDEX "Asset_spaceId_idx" ON "Asset"("spaceId");
CREATE INDEX "Asset_status_idx" ON "Asset"("status");
CREATE INDEX "Repair_targetDate_idx" ON "Repair"("targetDate");

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_lastChangedByUserId_fkey"
  FOREIGN KEY ("lastChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_reportedByUserId_fkey"
  FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_reportedByEmployeeId_fkey"
  FOREIGN KEY ("reportedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "Repair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetIssueUpdate" ADD CONSTRAINT "AssetIssueUpdate_issueId_fkey"
  FOREIGN KEY ("issueId") REFERENCES "AssetIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetIssueUpdate" ADD CONSTRAINT "AssetIssueUpdate_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetIssueUpdate" ADD CONSTRAINT "AssetIssueUpdate_updatedByEmployeeId_fkey"
  FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetIssueEvidenceLink" ADD CONSTRAINT "AssetIssueEvidenceLink_issueId_fkey"
  FOREIGN KEY ("issueId") REFERENCES "AssetIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetIssueEvidenceLink" ADD CONSTRAINT "AssetIssueEvidenceLink_evidenceRecordId_fkey"
  FOREIGN KEY ("evidenceRecordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetIssueEvidenceLink" ADD CONSTRAINT "AssetIssueEvidenceLink_linkedByUserId_fkey"
  FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetStatusHistory" ADD CONSTRAINT "AssetStatusHistory_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetStatusHistory" ADD CONSTRAINT "AssetStatusHistory_changedByUserId_fkey"
  FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetStatusHistory" ADD CONSTRAINT "AssetStatusHistory_sourceIssueId_fkey"
  FOREIGN KEY ("sourceIssueId") REFERENCES "AssetIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetStatusHistory" ADD CONSTRAINT "AssetStatusHistory_sourceRepairId_fkey"
  FOREIGN KEY ("sourceRepairId") REFERENCES "Repair"("id") ON DELETE SET NULL ON UPDATE CASCADE;
