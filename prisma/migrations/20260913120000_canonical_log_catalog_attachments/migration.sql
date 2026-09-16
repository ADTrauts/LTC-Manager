-- Phase 3: Canonical Logs — platform Catalog + facility LogAttachment + Evidence linkage.
-- Additive only. Does not modify legacy LogTemplate / LogAssignment / LogSubmission.
-- Does not alter InspectionDefinition. Phase 9C OperationalTemplate remains.

-- CreateEnum
CREATE TYPE "CatalogLogStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "CatalogLogPurposeType" AS ENUM ('LOG', 'CHECKLIST');

-- CreateEnum
CREATE TYPE "CatalogLogCategory" AS ENUM ('TEMPERATURE', 'SANITATION', 'CLEANING', 'EQUIPMENT', 'FOOD_SAFETY', 'OPENING_CLOSING', 'COMPLIANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "CatalogRecommendedCadence" AS ENUM ('ONCE_DAILY', 'TWICE_DAILY', 'THREE_TIMES_DAILY', 'ONCE_PER_OPERATIONAL_CYCLE', 'WEEKLY', 'MONTHLY', 'AD_HOC');

-- CreateEnum
CREATE TYPE "LogAttachmentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "LogAttachmentTargetKind" AS ENUM ('ASSET', 'SPACE', 'UNIT', 'DEPARTMENT', 'FACILITY');

-- CreateEnum
CREATE TYPE "LogAttachmentTimingMode" AS ENUM ('DAILY_WINDOWS', 'OPERATIONAL_CYCLE', 'CALENDAR', 'AD_HOC');

-- CreateEnum
CREATE TYPE "LogAttachmentCalendarCadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "CatalogLogDefinition" (
    "id" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "CatalogLogStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "purposeType" "CatalogLogPurposeType" NOT NULL,
    "category" "CatalogLogCategory" NOT NULL DEFAULT 'OTHER',
    "recommendedCadence" "CatalogRecommendedCadence",
    "recommendedScheduleKind" "OperationalTemplateScheduleKind",
    "recommendedDaypartLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendedFixedWindowsJson" JSONB,
    "suggestionsJson" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogLogDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogLogField" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "OperationalEvidenceFieldType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "displaySequence" INTEGER NOT NULL,
    "helpText" TEXT,
    "unitLabel" TEXT,
    "minNumber" DOUBLE PRECISION,
    "maxNumber" DOUBLE PRECISION,
    "allowedSelections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "correctiveActionTrigger" BOOLEAN NOT NULL DEFAULT false,
    "correctiveActionRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogLogField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAttachment" (
    "id" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "catalogDefinitionId" TEXT NOT NULL,
    "catalogStableKey" TEXT NOT NULL,
    "catalogVersion" INTEGER NOT NULL,
    "status" "LogAttachmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "retiredAt" TIMESTAMP(3),
    "localDisplayLabel" TEXT,
    "localInstructions" TEXT,
    "targetKind" "LogAttachmentTargetKind" NOT NULL,
    "assetId" TEXT,
    "spaceId" TEXT,
    "unitId" TEXT,
    "targetDepartmentId" TEXT,
    "timingMode" "LogAttachmentTimingMode" NOT NULL,
    "calendarCadence" "LogAttachmentCalendarCadence",
    "calendarDaysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "calendarDayOfMonth" INTEGER,
    "calendarDueTimeLocal" TEXT,
    "allowAdHoc" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAttachmentDailyWindow" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "displaySequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogAttachmentDailyWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAttachmentCycleSelection" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "displaySequence" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAttachmentCycleSelection_pkey" PRIMARY KEY ("id")
);

-- AlterTable OperationalEvidenceRecord — Attachment-backed Logs; templateId nullable for Catalog path
ALTER TABLE "OperationalEvidenceRecord" ALTER COLUMN "templateId" DROP NOT NULL;
ALTER TABLE "OperationalEvidenceRecord" ADD COLUMN "logAttachmentId" TEXT;
ALTER TABLE "OperationalEvidenceRecord" ADD COLUMN "attachmentStableKey" TEXT;
ALTER TABLE "OperationalEvidenceRecord" ADD COLUMN "logRequirementKey" TEXT;
ALTER TABLE "OperationalEvidenceRecord" ADD COLUMN "catalogDefinitionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CatalogLogDefinition_stableKey_version_key" ON "CatalogLogDefinition"("stableKey", "version");
CREATE INDEX "CatalogLogDefinition_status_idx" ON "CatalogLogDefinition"("status");
CREATE INDEX "CatalogLogDefinition_purposeType_category_idx" ON "CatalogLogDefinition"("purposeType", "category");
CREATE INDEX "CatalogLogDefinition_stableKey_status_idx" ON "CatalogLogDefinition"("stableKey", "status");

CREATE UNIQUE INDEX "CatalogLogField_definitionId_fieldKey_key" ON "CatalogLogField"("definitionId", "fieldKey");
CREATE UNIQUE INDEX "CatalogLogField_definitionId_displaySequence_key" ON "CatalogLogField"("definitionId", "displaySequence");
CREATE INDEX "CatalogLogField_definitionId_idx" ON "CatalogLogField"("definitionId");

CREATE UNIQUE INDEX "LogAttachment_facilityId_stableKey_key" ON "LogAttachment"("facilityId", "stableKey");
CREATE INDEX "LogAttachment_facilityId_departmentId_status_idx" ON "LogAttachment"("facilityId", "departmentId", "status");
CREATE INDEX "LogAttachment_facilityId_catalogStableKey_idx" ON "LogAttachment"("facilityId", "catalogStableKey");
CREATE INDEX "LogAttachment_catalogDefinitionId_idx" ON "LogAttachment"("catalogDefinitionId");
CREATE INDEX "LogAttachment_assetId_idx" ON "LogAttachment"("assetId");
CREATE INDEX "LogAttachment_spaceId_idx" ON "LogAttachment"("spaceId");
CREATE INDEX "LogAttachment_unitId_idx" ON "LogAttachment"("unitId");
CREATE INDEX "LogAttachment_targetDepartmentId_idx" ON "LogAttachment"("targetDepartmentId");
CREATE INDEX "LogAttachment_effectiveFrom_idx" ON "LogAttachment"("effectiveFrom");

CREATE UNIQUE INDEX "LogAttachmentDailyWindow_attachmentId_displaySequence_key" ON "LogAttachmentDailyWindow"("attachmentId", "displaySequence");
CREATE INDEX "LogAttachmentDailyWindow_attachmentId_idx" ON "LogAttachmentDailyWindow"("attachmentId");

CREATE UNIQUE INDEX "LogAttachmentCycleSelection_attachmentId_cycleStableKey_key" ON "LogAttachmentCycleSelection"("attachmentId", "cycleStableKey");
CREATE INDEX "LogAttachmentCycleSelection_attachmentId_idx" ON "LogAttachmentCycleSelection"("attachmentId");
CREATE INDEX "LogAttachmentCycleSelection_cycleStableKey_idx" ON "LogAttachmentCycleSelection"("cycleStableKey");

CREATE INDEX "OperationalEvidenceRecord_logAttachmentId_operationalDate_idx" ON "OperationalEvidenceRecord"("logAttachmentId", "operationalDate");
CREATE INDEX "OperationalEvidenceRecord_logRequirementKey_operationalDate_idx" ON "OperationalEvidenceRecord"("logRequirementKey", "operationalDate");
CREATE INDEX "OperationalEvidenceRecord_catalogDefinitionId_idx" ON "OperationalEvidenceRecord"("catalogDefinitionId");
CREATE INDEX "OperationalEvidenceRecord_attachmentStableKey_idx" ON "OperationalEvidenceRecord"("attachmentStableKey");

-- AddForeignKey
ALTER TABLE "CatalogLogField" ADD CONSTRAINT "CatalogLogField_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_catalogDefinitionId_fkey" FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_targetDepartmentId_fkey" FOREIGN KEY ("targetDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LogAttachmentDailyWindow" ADD CONSTRAINT "LogAttachmentDailyWindow_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "LogAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogAttachmentCycleSelection" ADD CONSTRAINT "LogAttachmentCycleSelection_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "LogAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_logAttachmentId_fkey" FOREIGN KEY ("logAttachmentId") REFERENCES "LogAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_catalogDefinitionId_fkey" FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Target exclusivity: exactly one target FK for ASSET/SPACE/UNIT/DEPARTMENT; none for FACILITY
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_target_exclusivity_check" CHECK (
  (
    "targetKind" = 'ASSET' AND "assetId" IS NOT NULL AND "spaceId" IS NULL AND "unitId" IS NULL AND "targetDepartmentId" IS NULL
  ) OR (
    "targetKind" = 'SPACE' AND "spaceId" IS NOT NULL AND "assetId" IS NULL AND "unitId" IS NULL AND "targetDepartmentId" IS NULL
  ) OR (
    "targetKind" = 'UNIT' AND "unitId" IS NOT NULL AND "assetId" IS NULL AND "spaceId" IS NULL AND "targetDepartmentId" IS NULL
  ) OR (
    "targetKind" = 'DEPARTMENT' AND "targetDepartmentId" IS NOT NULL AND "assetId" IS NULL AND "spaceId" IS NULL AND "unitId" IS NULL
  ) OR (
    "targetKind" = 'FACILITY' AND "assetId" IS NULL AND "spaceId" IS NULL AND "unitId" IS NULL AND "targetDepartmentId" IS NULL
  )
);

-- Evidence must reference either Phase 9C template or Catalog Attachment (or both during transition)
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_template_or_attachment_check" CHECK (
  "templateId" IS NOT NULL OR "logAttachmentId" IS NOT NULL
);
