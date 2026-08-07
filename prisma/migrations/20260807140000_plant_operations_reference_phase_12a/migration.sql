-- Phase 12A: Plant Operations reference — OperationalRequest + routing + requester-visible WO notes.
-- Additive only. Safe on empty DB and existing data. Does not write ltc_manager.
-- Does not activate OPERATION_ENGINE_ENABLED, TASK_SYNC_ENABLED, or PLANT_OPERATIONS_ENABLED.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "OperationalRequestStatus" AS ENUM (
  'REPORTED',
  'ACKNOWLEDGED',
  'UNDER_REVIEW',
  'WORK_ASSIGNED',
  'WORK_IN_PROGRESS',
  'WAITING_ON_VENDOR',
  'WAITING_ON_PARTS',
  'MONITORING',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
  'REOPENED'
);

-- ---------------------------------------------------------------------------
-- RepairUpdate: requester-visible flag
-- ---------------------------------------------------------------------------

ALTER TABLE "RepairUpdate"
  ADD COLUMN "requesterVisible" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- DepartmentRequestRoute
-- ---------------------------------------------------------------------------

CREATE TABLE "DepartmentRequestRoute" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "requestingDepartmentId" TEXT NOT NULL,
  "responsibleDepartmentId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DepartmentRequestRoute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentRequestRoute_facilityId_requestingDepartmentId_responsibleDepartmentId_key"
  ON "DepartmentRequestRoute"("facilityId", "requestingDepartmentId", "responsibleDepartmentId");

CREATE INDEX "DepartmentRequestRoute_facilityId_requestingDepartmentId_idx"
  ON "DepartmentRequestRoute"("facilityId", "requestingDepartmentId");

CREATE INDEX "DepartmentRequestRoute_facilityId_requestingDepartmentId_isActive_idx"
  ON "DepartmentRequestRoute"("facilityId", "requestingDepartmentId", "isActive");

ALTER TABLE "DepartmentRequestRoute"
  ADD CONSTRAINT "DepartmentRequestRoute_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentRequestRoute"
  ADD CONSTRAINT "DepartmentRequestRoute_requestingDepartmentId_fkey"
  FOREIGN KEY ("requestingDepartmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentRequestRoute"
  ADD CONSTRAINT "DepartmentRequestRoute_responsibleDepartmentId_fkey"
  FOREIGN KEY ("responsibleDepartmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- OperationalRequest
-- ---------------------------------------------------------------------------

CREATE TABLE "OperationalRequest" (
  "id" TEXT NOT NULL,
  "requestCode" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "requestingDepartmentId" TEXT NOT NULL,
  "responsibleDepartmentId" TEXT NOT NULL,
  "affectedDepartmentId" TEXT,
  "unitId" TEXT NOT NULL,
  "spaceId" TEXT,
  "assetId" TEXT,
  "summary" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "OperationalRequestStatus" NOT NULL DEFAULT 'REPORTED',
  "priority" "RepairPriority" NOT NULL DEFAULT 'MEDIUM',
  "operationalImpact" "AssetOperationalImpact" NOT NULL DEFAULT 'NO_IMMEDIATE_IMPACT',
  "equipmentRemainsUsable" BOOLEAN,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requesterVisibleStatusSummary" TEXT,
  "workaroundInstruction" TEXT,
  "reportedByUserId" TEXT,
  "reportedByEmployeeId" TEXT,
  "reportedByLabel" TEXT,
  "triageNote" TEXT,
  "resolutionReason" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "relatedAssetIssueId" TEXT,
  "workOrderId" TEXT,
  "clientCommandId" TEXT,
  "recordedOnline" BOOLEAN NOT NULL DEFAULT true,
  "synchronizedAt" TIMESTAMP(3),
  "deviceBoundUnitId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperationalRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalRequest_requestCode_key" ON "OperationalRequest"("requestCode");
CREATE UNIQUE INDEX "OperationalRequest_relatedAssetIssueId_key" ON "OperationalRequest"("relatedAssetIssueId");
CREATE UNIQUE INDEX "OperationalRequest_workOrderId_key" ON "OperationalRequest"("workOrderId");
CREATE UNIQUE INDEX "OperationalRequest_facilityId_requestingDepartmentId_clientCommandId_key"
  ON "OperationalRequest"("facilityId", "requestingDepartmentId", "clientCommandId");

CREATE INDEX "OperationalRequest_facilityId_responsibleDepartmentId_status_idx"
  ON "OperationalRequest"("facilityId", "responsibleDepartmentId", "status");
CREATE INDEX "OperationalRequest_facilityId_requestingDepartmentId_status_idx"
  ON "OperationalRequest"("facilityId", "requestingDepartmentId", "status");
CREATE INDEX "OperationalRequest_facilityId_unitId_status_idx"
  ON "OperationalRequest"("facilityId", "unitId", "status");
CREATE INDEX "OperationalRequest_priority_status_idx"
  ON "OperationalRequest"("priority", "status");
CREATE INDEX "OperationalRequest_assetId_idx" ON "OperationalRequest"("assetId");
CREATE INDEX "OperationalRequest_workOrderId_idx" ON "OperationalRequest"("workOrderId");
CREATE INDEX "OperationalRequest_relatedAssetIssueId_idx" ON "OperationalRequest"("relatedAssetIssueId");
CREATE INDEX "OperationalRequest_observedAt_idx" ON "OperationalRequest"("observedAt");

ALTER TABLE "OperationalRequest"
  ADD CONSTRAINT "OperationalRequest_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalRequest"
  ADD CONSTRAINT "OperationalRequest_requestingDepartmentId_fkey"
  FOREIGN KEY ("requestingDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalRequest"
  ADD CONSTRAINT "OperationalRequest_responsibleDepartmentId_fkey"
  FOREIGN KEY ("responsibleDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalRequest"
  ADD CONSTRAINT "OperationalRequest_affectedDepartmentId_fkey"
  FOREIGN KEY ("affectedDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalRequest"
  ADD CONSTRAINT "OperationalRequest_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalRequest"
  ADD CONSTRAINT "OperationalRequest_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalRequest"
  ADD CONSTRAINT "OperationalRequest_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalRequest"
  ADD CONSTRAINT "OperationalRequest_reportedByUserId_fkey"
  FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalRequest"
  ADD CONSTRAINT "OperationalRequest_reportedByEmployeeId_fkey"
  FOREIGN KEY ("reportedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalRequest"
  ADD CONSTRAINT "OperationalRequest_relatedAssetIssueId_fkey"
  FOREIGN KEY ("relatedAssetIssueId") REFERENCES "AssetIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalRequest"
  ADD CONSTRAINT "OperationalRequest_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "Repair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- OperationalRequestUpdate
-- ---------------------------------------------------------------------------

CREATE TABLE "OperationalRequestUpdate" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "updateText" TEXT NOT NULL,
  "statusAfterUpdate" "OperationalRequestStatus",
  "updatedByUserId" TEXT,
  "updatedByEmployeeId" TEXT,
  "requesterVisible" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperationalRequestUpdate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationalRequestUpdate_requestId_updatedAt_idx"
  ON "OperationalRequestUpdate"("requestId", "updatedAt");

ALTER TABLE "OperationalRequestUpdate"
  ADD CONSTRAINT "OperationalRequestUpdate_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "OperationalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalRequestUpdate"
  ADD CONSTRAINT "OperationalRequestUpdate_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalRequestUpdate"
  ADD CONSTRAINT "OperationalRequestUpdate_updatedByEmployeeId_fkey"
  FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- OperationalRequestEvidenceLink
-- ---------------------------------------------------------------------------

CREATE TABLE "OperationalRequestEvidenceLink" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "evidenceRecordId" TEXT NOT NULL,
  "linkedByUserId" TEXT,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,

  CONSTRAINT "OperationalRequestEvidenceLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalRequestEvidenceLink_requestId_evidenceRecordId_key"
  ON "OperationalRequestEvidenceLink"("requestId", "evidenceRecordId");

CREATE INDEX "OperationalRequestEvidenceLink_evidenceRecordId_idx"
  ON "OperationalRequestEvidenceLink"("evidenceRecordId");

ALTER TABLE "OperationalRequestEvidenceLink"
  ADD CONSTRAINT "OperationalRequestEvidenceLink_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "OperationalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalRequestEvidenceLink"
  ADD CONSTRAINT "OperationalRequestEvidenceLink_evidenceRecordId_fkey"
  FOREIGN KEY ("evidenceRecordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalRequestEvidenceLink"
  ADD CONSTRAINT "OperationalRequestEvidenceLink_linkedByUserId_fkey"
  FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
