-- Phase 11A: Dietary Department Work Plans (Work Plans, Work Items, sparse occurrences).
-- Additive only. Safe on empty DB and existing data.
-- Does not modify ltc_manager. Does not activate OPERATION_ENGINE_ENABLED or TASK_SYNC_ENABLED.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "DepartmentWorkPlanStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

CREATE TYPE "DepartmentWorkItemPriority" AS ENUM ('ROUTINE', 'TIME_SENSITIVE', 'URGENT');

CREATE TYPE "DepartmentWorkCompletionMode" AS ENUM ('EXPLICIT_CONFIRMATION', 'LINKED_EVIDENCE');

CREATE TYPE "DepartmentWorkResponsibilityMode" AS ENUM ('UNIT_SHARED', 'EACH_ASSIGNED_EMPLOYEE');

CREATE TYPE "DepartmentWorkScheduleKind" AS ENUM (
  'OPERATIONAL_CYCLE',
  'FIXED_DAILY_WINDOW',
  'ONCE_PER_OPERATIONAL_DATE'
);

CREATE TYPE "DepartmentWorkDueOffsetKind" AS ENUM (
  'CYCLE_START',
  'CYCLE_END',
  'MINUTES_BEFORE_CYCLE_END'
);

CREATE TYPE "DepartmentWorkApplicabilityKind" AS ENUM (
  'DEPARTMENT_UNIT',
  'SPECIFIC_UNIT',
  'SPECIFIC_SPACE',
  'SPACE_TYPE',
  'SPECIFIC_ASSET',
  'ASSET_TYPE'
);

CREATE TYPE "DepartmentWorkOccurrenceSourceKind" AS ENUM ('WORK_PLAN', 'ONE_OFF');

CREATE TYPE "DepartmentWorkOccurrenceStatus" AS ENUM (
  'OPEN',
  'COMPLETED',
  'COMPLETED_WITH_EVIDENCE',
  'NOT_REQUIRED',
  'CANCELLED',
  'REOPENED'
);

CREATE TYPE "DepartmentWorkEventType" AS ENUM (
  'CREATED',
  'COMPLETED',
  'COMPLETED_WITH_EVIDENCE',
  'NOT_REQUIRED',
  'REOPENED',
  'REASSIGNED',
  'CANCELLED',
  'CORRECTED',
  'CONFLICT',
  'OFFLINE_SYNCED'
);

-- ---------------------------------------------------------------------------
-- DepartmentWorkPlan
-- ---------------------------------------------------------------------------

CREATE TABLE "DepartmentWorkPlan" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "stableKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "DepartmentWorkPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "presetKey" TEXT,
  "effectiveStartDate" DATE,
  "effectiveEndDate" DATE,
  "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  "createdByUserId" TEXT,
  "publishedByUserId" TEXT,
  "retiredByUserId" TEXT,
  "lastChangedByUserId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DepartmentWorkPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentWorkPlan_departmentId_stableKey_version_key"
  ON "DepartmentWorkPlan"("departmentId", "stableKey", "version");
CREATE INDEX "DepartmentWorkPlan_facilityId_departmentId_status_idx"
  ON "DepartmentWorkPlan"("facilityId", "departmentId", "status");
CREATE INDEX "DepartmentWorkPlan_departmentId_status_name_idx"
  ON "DepartmentWorkPlan"("departmentId", "status", "name");

ALTER TABLE "DepartmentWorkPlan"
  ADD CONSTRAINT "DepartmentWorkPlan_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkPlan"
  ADD CONSTRAINT "DepartmentWorkPlan_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkPlan"
  ADD CONSTRAINT "DepartmentWorkPlan_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkPlan"
  ADD CONSTRAINT "DepartmentWorkPlan_publishedByUserId_fkey"
  FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkPlan"
  ADD CONSTRAINT "DepartmentWorkPlan_retiredByUserId_fkey"
  FOREIGN KEY ("retiredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkPlan"
  ADD CONSTRAINT "DepartmentWorkPlan_lastChangedByUserId_fkey"
  FOREIGN KEY ("lastChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- DepartmentWorkPlanApplicability
-- ---------------------------------------------------------------------------

CREATE TABLE "DepartmentWorkPlanApplicability" (
  "id" TEXT NOT NULL,
  "workPlanId" TEXT NOT NULL,
  "kind" "DepartmentWorkApplicabilityKind" NOT NULL,
  "unitId" TEXT,
  "spaceId" TEXT,
  "spaceType" "SpaceType",
  "assetId" TEXT,
  "assetType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DepartmentWorkPlanApplicability_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DepartmentWorkPlanApplicability_workPlanId_idx"
  ON "DepartmentWorkPlanApplicability"("workPlanId");
CREATE INDEX "DepartmentWorkPlanApplicability_unitId_idx"
  ON "DepartmentWorkPlanApplicability"("unitId");
CREATE INDEX "DepartmentWorkPlanApplicability_assetId_idx"
  ON "DepartmentWorkPlanApplicability"("assetId");

ALTER TABLE "DepartmentWorkPlanApplicability"
  ADD CONSTRAINT "DepartmentWorkPlanApplicability_workPlanId_fkey"
  FOREIGN KEY ("workPlanId") REFERENCES "DepartmentWorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- DepartmentWorkItem
-- ---------------------------------------------------------------------------

CREATE TABLE "DepartmentWorkItem" (
  "id" TEXT NOT NULL,
  "workPlanId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "instructions" TEXT,
  "displaySequence" INTEGER NOT NULL,
  "priority" "DepartmentWorkItemPriority" NOT NULL DEFAULT 'ROUTINE',
  "completionMode" "DepartmentWorkCompletionMode" NOT NULL DEFAULT 'EXPLICIT_CONFIRMATION',
  "responsibilityMode" "DepartmentWorkResponsibilityMode" NOT NULL DEFAULT 'UNIT_SHARED',
  "scheduleKind" "DepartmentWorkScheduleKind" NOT NULL DEFAULT 'OPERATIONAL_CYCLE',
  "cycleStableKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "windowStartLocal" TEXT,
  "windowEndLocal" TEXT,
  "dueOffsetKind" "DepartmentWorkDueOffsetKind",
  "dueOffsetMinutes" INTEGER,
  "roleKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "unitId" TEXT,
  "spaceId" TEXT,
  "assetId" TEXT,
  "knowledgeArticleId" TEXT,
  "procedureTitleSnapshot" TEXT,
  "linkedTemplateStableKey" TEXT,
  "linkedTemplateId" TEXT,
  "supervisorVisible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DepartmentWorkItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentWorkItem_workPlanId_itemKey_key"
  ON "DepartmentWorkItem"("workPlanId", "itemKey");
CREATE INDEX "DepartmentWorkItem_workPlanId_displaySequence_idx"
  ON "DepartmentWorkItem"("workPlanId", "displaySequence");
CREATE INDEX "DepartmentWorkItem_knowledgeArticleId_idx"
  ON "DepartmentWorkItem"("knowledgeArticleId");
CREATE INDEX "DepartmentWorkItem_linkedTemplateStableKey_idx"
  ON "DepartmentWorkItem"("linkedTemplateStableKey");

ALTER TABLE "DepartmentWorkItem"
  ADD CONSTRAINT "DepartmentWorkItem_workPlanId_fkey"
  FOREIGN KEY ("workPlanId") REFERENCES "DepartmentWorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkItem"
  ADD CONSTRAINT "DepartmentWorkItem_knowledgeArticleId_fkey"
  FOREIGN KEY ("knowledgeArticleId") REFERENCES "KnowledgeArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- DepartmentWorkPlanEvent
-- ---------------------------------------------------------------------------

CREATE TABLE "DepartmentWorkPlanEvent" (
  "id" TEXT NOT NULL,
  "workPlanId" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorLabel" TEXT,
  "detailJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DepartmentWorkPlanEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DepartmentWorkPlanEvent_workPlanId_createdAt_idx"
  ON "DepartmentWorkPlanEvent"("workPlanId", "createdAt");
CREATE INDEX "DepartmentWorkPlanEvent_facilityId_departmentId_createdAt_idx"
  ON "DepartmentWorkPlanEvent"("facilityId", "departmentId", "createdAt");

ALTER TABLE "DepartmentWorkPlanEvent"
  ADD CONSTRAINT "DepartmentWorkPlanEvent_workPlanId_fkey"
  FOREIGN KEY ("workPlanId") REFERENCES "DepartmentWorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- DepartmentWorkOccurrence (sparse runtime state)
-- ---------------------------------------------------------------------------

CREATE TABLE "DepartmentWorkOccurrence" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "occurrenceKey" TEXT NOT NULL,
  "sourceKind" "DepartmentWorkOccurrenceSourceKind" NOT NULL DEFAULT 'WORK_PLAN',
  "operationalDate" DATE NOT NULL,
  "workPlanId" TEXT,
  "workPlanStableKey" TEXT,
  "workPlanVersion" INTEGER,
  "workItemId" TEXT,
  "workItemKey" TEXT,
  "workItemLabelSnapshot" TEXT NOT NULL,
  "instructionsSnapshot" TEXT,
  "priority" "DepartmentWorkItemPriority" NOT NULL DEFAULT 'ROUTINE',
  "completionMode" "DepartmentWorkCompletionMode" NOT NULL DEFAULT 'EXPLICIT_CONFIRMATION',
  "responsibilityMode" "DepartmentWorkResponsibilityMode" NOT NULL DEFAULT 'UNIT_SHARED',
  "unitId" TEXT,
  "spaceId" TEXT,
  "assetId" TEXT,
  "cycleStableKey" TEXT,
  "windowStartLocal" TEXT,
  "windowEndLocal" TEXT,
  "dueAt" TIMESTAMP(3),
  "status" "DepartmentWorkOccurrenceStatus" NOT NULL DEFAULT 'OPEN',
  "assignedEmployeeId" TEXT,
  "originalAssignedEmployeeId" TEXT,
  "completedAt" TIMESTAMP(3),
  "completedByUserId" TEXT,
  "completedByEmployeeId" TEXT,
  "completedByLabel" TEXT,
  "recordedAt" TIMESTAMP(3),
  "synchronizedAt" TIMESTAMP(3),
  "recordedOnline" BOOLEAN NOT NULL DEFAULT true,
  "clientCommandId" TEXT,
  "deviceBoundUnitId" TEXT,
  "authenticationMethod" TEXT,
  "completionNote" TEXT,
  "evidenceRecordId" TEXT,
  "knowledgeArticleId" TEXT,
  "procedureTitleSnapshot" TEXT,
  "notRequiredReason" TEXT,
  "notRequiredAt" TIMESTAMP(3),
  "notRequiredByUserId" TEXT,
  "reassignedAt" TIMESTAMP(3),
  "reassignedByUserId" TEXT,
  "createdByUserId" TEXT,
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DepartmentWorkOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentWorkOccurrence_facilityId_departmentId_occurrenceKey_key"
  ON "DepartmentWorkOccurrence"("facilityId", "departmentId", "occurrenceKey");
CREATE UNIQUE INDEX "DepartmentWorkOccurrence_facilityId_departmentId_clientCommandId_key"
  ON "DepartmentWorkOccurrence"("facilityId", "departmentId", "clientCommandId");
CREATE INDEX "DepartmentWorkOccurrence_facilityId_departmentId_operationalDate_idx"
  ON "DepartmentWorkOccurrence"("facilityId", "departmentId", "operationalDate");
CREATE INDEX "DepartmentWorkOccurrence_facilityId_unitId_operationalDate_idx"
  ON "DepartmentWorkOccurrence"("facilityId", "unitId", "operationalDate");
CREATE INDEX "DepartmentWorkOccurrence_facilityId_departmentId_status_operationalDate_idx"
  ON "DepartmentWorkOccurrence"("facilityId", "departmentId", "status", "operationalDate");
CREATE INDEX "DepartmentWorkOccurrence_assignedEmployeeId_idx"
  ON "DepartmentWorkOccurrence"("assignedEmployeeId");
CREATE INDEX "DepartmentWorkOccurrence_workPlanId_idx"
  ON "DepartmentWorkOccurrence"("workPlanId");
CREATE INDEX "DepartmentWorkOccurrence_workItemId_idx"
  ON "DepartmentWorkOccurrence"("workItemId");

ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_workPlanId_fkey"
  FOREIGN KEY ("workPlanId") REFERENCES "DepartmentWorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_workItemId_fkey"
  FOREIGN KEY ("workItemId") REFERENCES "DepartmentWorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_assignedEmployeeId_fkey"
  FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_originalAssignedEmployeeId_fkey"
  FOREIGN KEY ("originalAssignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_completedByUserId_fkey"
  FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_completedByEmployeeId_fkey"
  FOREIGN KEY ("completedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_notRequiredByUserId_fkey"
  FOREIGN KEY ("notRequiredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_reassignedByUserId_fkey"
  FOREIGN KEY ("reassignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkOccurrence"
  ADD CONSTRAINT "DepartmentWorkOccurrence_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- DepartmentWorkEvent
-- ---------------------------------------------------------------------------

CREATE TABLE "DepartmentWorkEvent" (
  "id" TEXT NOT NULL,
  "occurrenceId" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "eventType" "DepartmentWorkEventType" NOT NULL,
  "actorUserId" TEXT,
  "actorEmployeeId" TEXT,
  "actorLabel" TEXT,
  "detailJson" JSONB,
  "previousStatus" "DepartmentWorkOccurrenceStatus",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DepartmentWorkEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DepartmentWorkEvent_occurrenceId_createdAt_idx"
  ON "DepartmentWorkEvent"("occurrenceId", "createdAt");
CREATE INDEX "DepartmentWorkEvent_facilityId_departmentId_createdAt_idx"
  ON "DepartmentWorkEvent"("facilityId", "departmentId", "createdAt");

ALTER TABLE "DepartmentWorkEvent"
  ADD CONSTRAINT "DepartmentWorkEvent_occurrenceId_fkey"
  FOREIGN KEY ("occurrenceId") REFERENCES "DepartmentWorkOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkEvent"
  ADD CONSTRAINT "DepartmentWorkEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkEvent"
  ADD CONSTRAINT "DepartmentWorkEvent_actorEmployeeId_fkey"
  FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
