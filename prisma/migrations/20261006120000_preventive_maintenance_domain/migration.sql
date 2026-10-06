-- Phase 4A: canonical Preventive Maintenance Plan domain.
-- Additive only. Does not rewrite PreventiveMaintenanceSchedule or backfill occurrences.
-- Active Work Order partial unique index is deferred to Phase 4B.

CREATE TYPE "PreventiveMaintenancePlanStatus" AS ENUM (
  'DRAFT',
  'PUBLISHED',
  'RETIRED'
);

CREATE TYPE "PreventiveMaintenancePlanVersionStatus" AS ENUM (
  'DRAFT',
  'PUBLISHED',
  'SUPERSEDED'
);

CREATE TYPE "PreventiveMaintenanceOccurrenceStatus" AS ENUM (
  'OPEN',
  'COMPLETED',
  'SKIPPED'
);

CREATE TABLE "PreventiveMaintenancePlan" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "status" "PreventiveMaintenancePlanStatus" NOT NULL DEFAULT 'DRAFT',
  "retiredAt" TIMESTAMP(3),
  "retiredByUserId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PreventiveMaintenancePlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PreventiveMaintenancePlan_facilityId_status_idx"
ON "PreventiveMaintenancePlan"("facilityId", "status");

CREATE INDEX "PreventiveMaintenancePlan_departmentId_status_idx"
ON "PreventiveMaintenancePlan"("departmentId", "status");

CREATE INDEX "PreventiveMaintenancePlan_assetId_status_idx"
ON "PreventiveMaintenancePlan"("assetId", "status");

CREATE INDEX "PreventiveMaintenancePlan_retiredByUserId_idx"
ON "PreventiveMaintenancePlan"("retiredByUserId");

CREATE INDEX "PreventiveMaintenancePlan_createdByUserId_idx"
ON "PreventiveMaintenancePlan"("createdByUserId");

ALTER TABLE "PreventiveMaintenancePlan"
ADD CONSTRAINT "PreventiveMaintenancePlan_facilityId_fkey"
FOREIGN KEY ("facilityId") REFERENCES "Facility"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreventiveMaintenancePlan"
ADD CONSTRAINT "PreventiveMaintenancePlan_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PreventiveMaintenancePlan"
ADD CONSTRAINT "PreventiveMaintenancePlan_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PreventiveMaintenancePlan"
ADD CONSTRAINT "PreventiveMaintenancePlan_retiredByUserId_fkey"
FOREIGN KEY ("retiredByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PreventiveMaintenancePlan"
ADD CONSTRAINT "PreventiveMaintenancePlan_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PreventiveMaintenancePlanVersion" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "PreventiveMaintenancePlanVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "createdFromVersionId" TEXT,
  "name" TEXT NOT NULL,
  "instructions" TEXT,
  "maintenanceCategoryId" TEXT,
  "intervalMonths" INTEGER NOT NULL DEFAULT 1,
  "anchorDate" DATE NOT NULL,
  "effectiveDate" DATE,
  "generationLeadDays" INTEGER NOT NULL DEFAULT 7,
  "priority" "RepairPriority" NOT NULL DEFAULT 'MEDIUM',
  "procedureVersionId" TEXT,
  "defaultAssignedEmployeeId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "publishedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PreventiveMaintenancePlanVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PreventiveMaintenancePlanVersion_planId_version_key"
ON "PreventiveMaintenancePlanVersion"("planId", "version");

CREATE INDEX "PreventiveMaintenancePlanVersion_planId_status_idx"
ON "PreventiveMaintenancePlanVersion"("planId", "status");

CREATE INDEX "PreventiveMaintenancePlanVersion_maintenanceCategoryId_idx"
ON "PreventiveMaintenancePlanVersion"("maintenanceCategoryId");

CREATE INDEX "PreventiveMaintenancePlanVersion_procedureVersionId_idx"
ON "PreventiveMaintenancePlanVersion"("procedureVersionId");

CREATE INDEX "PreventiveMaintenancePlanVersion_defaultAssignedEmployeeId_idx"
ON "PreventiveMaintenancePlanVersion"("defaultAssignedEmployeeId");

CREATE INDEX "PreventiveMaintenancePlanVersion_publishedByUserId_idx"
ON "PreventiveMaintenancePlanVersion"("publishedByUserId");

CREATE INDEX "PreventiveMaintenancePlanVersion_createdFromVersionId_idx"
ON "PreventiveMaintenancePlanVersion"("createdFromVersionId");

ALTER TABLE "PreventiveMaintenancePlanVersion"
ADD CONSTRAINT "PreventiveMaintenancePlanVersion_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "PreventiveMaintenancePlan"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreventiveMaintenancePlanVersion"
ADD CONSTRAINT "PreventiveMaintenancePlanVersion_createdFromVersionId_fkey"
FOREIGN KEY ("createdFromVersionId") REFERENCES "PreventiveMaintenancePlanVersion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PreventiveMaintenancePlanVersion"
ADD CONSTRAINT "PreventiveMaintenancePlanVersion_maintenanceCategoryId_fkey"
FOREIGN KEY ("maintenanceCategoryId") REFERENCES "MaintenanceCategory"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PreventiveMaintenancePlanVersion"
ADD CONSTRAINT "PreventiveMaintenancePlanVersion_procedureVersionId_fkey"
FOREIGN KEY ("procedureVersionId") REFERENCES "KnowledgeArticleVersion"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PreventiveMaintenancePlanVersion"
ADD CONSTRAINT "PreventiveMaintenancePlanVersion_defaultAssignedEmployeeId_fkey"
FOREIGN KEY ("defaultAssignedEmployeeId") REFERENCES "Employee"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PreventiveMaintenancePlanVersion"
ADD CONSTRAINT "PreventiveMaintenancePlanVersion_publishedByUserId_fkey"
FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PreventiveMaintenancePlanRecordRequirement" (
  "id" TEXT NOT NULL,
  "planVersionId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "templateStableKey" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "templateName" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PreventiveMaintenancePlanRecordRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PreventiveMaintenancePlanRecordRequirement_planVersionId_templateId_key"
ON "PreventiveMaintenancePlanRecordRequirement"("planVersionId", "templateId");

CREATE INDEX "PreventiveMaintenancePlanRecordRequirement_templateId_idx"
ON "PreventiveMaintenancePlanRecordRequirement"("templateId");

ALTER TABLE "PreventiveMaintenancePlanRecordRequirement"
ADD CONSTRAINT "PreventiveMaintenancePlanRecordRequirement_planVersionId_fkey"
FOREIGN KEY ("planVersionId") REFERENCES "PreventiveMaintenancePlanVersion"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreventiveMaintenancePlanRecordRequirement"
ADD CONSTRAINT "PreventiveMaintenancePlanRecordRequirement_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "OperationalTemplate"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PreventiveMaintenanceOccurrence" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "planVersionId" TEXT NOT NULL,
  "scheduledDate" DATE NOT NULL,
  "status" "PreventiveMaintenanceOccurrenceStatus" NOT NULL DEFAULT 'OPEN',
  "skippedAt" TIMESTAMP(3),
  "skippedByUserId" TEXT,
  "skipReason" TEXT,
  "completedAt" TIMESTAMP(3),
  "completedWorkOrderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PreventiveMaintenanceOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PreventiveMaintenanceOccurrence_planId_scheduledDate_key"
ON "PreventiveMaintenanceOccurrence"("planId", "scheduledDate");

CREATE UNIQUE INDEX "PreventiveMaintenanceOccurrence_completedWorkOrderId_key"
ON "PreventiveMaintenanceOccurrence"("completedWorkOrderId");

CREATE INDEX "PreventiveMaintenanceOccurrence_planVersionId_idx"
ON "PreventiveMaintenanceOccurrence"("planVersionId");

CREATE INDEX "PreventiveMaintenanceOccurrence_status_scheduledDate_idx"
ON "PreventiveMaintenanceOccurrence"("status", "scheduledDate");

CREATE INDEX "PreventiveMaintenanceOccurrence_skippedByUserId_idx"
ON "PreventiveMaintenanceOccurrence"("skippedByUserId");

ALTER TABLE "PreventiveMaintenanceOccurrence"
ADD CONSTRAINT "PreventiveMaintenanceOccurrence_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "PreventiveMaintenancePlan"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreventiveMaintenanceOccurrence"
ADD CONSTRAINT "PreventiveMaintenanceOccurrence_planVersionId_fkey"
FOREIGN KEY ("planVersionId") REFERENCES "PreventiveMaintenancePlanVersion"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PreventiveMaintenanceOccurrence"
ADD CONSTRAINT "PreventiveMaintenanceOccurrence_skippedByUserId_fkey"
FOREIGN KEY ("skippedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Repair" ADD COLUMN "pmOccurrenceId" TEXT;

CREATE INDEX "Repair_pmOccurrenceId_idx" ON "Repair"("pmOccurrenceId");

ALTER TABLE "Repair"
ADD CONSTRAINT "Repair_pmOccurrenceId_fkey"
FOREIGN KEY ("pmOccurrenceId") REFERENCES "PreventiveMaintenanceOccurrence"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PreventiveMaintenanceOccurrence"
ADD CONSTRAINT "PreventiveMaintenanceOccurrence_completedWorkOrderId_fkey"
FOREIGN KEY ("completedWorkOrderId") REFERENCES "Repair"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
