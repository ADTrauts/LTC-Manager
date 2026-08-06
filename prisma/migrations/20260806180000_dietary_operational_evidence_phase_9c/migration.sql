-- Phase 9C: Unified Operational Templates + Evidence Records (Dietary).
-- Additive only. Does not modify legacy LogTemplate / InspectionDefinition.
-- Does not activate Operation Engine models. Requirement occurrences are derived.

-- CreateEnum
CREATE TYPE "OperationalTemplatePurposeType" AS ENUM ('LOG', 'CHECKLIST', 'INSPECTION');

-- CreateEnum
CREATE TYPE "OperationalTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "OperationalEvidenceFieldType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'TEMPERATURE', 'YES_NO', 'PASS_NEEDS_ATTENTION', 'SINGLE_SELECT', 'MULTI_SELECT', 'DATE', 'TIME', 'ATTESTATION', 'OPTIONAL_COMMENT');

-- CreateEnum
CREATE TYPE "OperationalTemplateApplicabilityKind" AS ENUM ('SPECIFIC_ASSET', 'ASSET_TYPE', 'SPECIFIC_SPACE', 'SPACE_TYPE', 'DEPARTMENT_UNIT');

-- CreateEnum
CREATE TYPE "OperationalTemplateScheduleKind" AS ENUM ('OPERATIONAL_CYCLE', 'FIXED_DAILY_WINDOW', 'ONCE_PER_OPERATIONAL_DATE', 'AD_HOC');

-- CreateEnum
CREATE TYPE "OperationalEvidenceRecordStatus" AS ENUM ('COMPLETED', 'COMPLETED_WITH_CORRECTIVE_ACTION', 'NEEDS_REVIEW');

-- AlterTable
ALTER TABLE "OfflineSyncReceipt" ADD COLUMN "evidenceRecordId" TEXT;

-- CreateTable
CREATE TABLE "OperationalTemplate" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "purposeType" "OperationalTemplatePurposeType" NOT NULL,
    "status" "OperationalTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "presetKey" TEXT,
    "allowAdHoc" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "publishedByUserId" TEXT,
    "lastChangedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalTemplateField" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
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

    CONSTRAINT "OperationalTemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalTemplateApplicability" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "kind" "OperationalTemplateApplicabilityKind" NOT NULL,
    "assetId" TEXT,
    "assetType" TEXT,
    "spaceId" TEXT,
    "spaceType" "SpaceType",
    "unitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalTemplateApplicability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalTemplateSchedule" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "kind" "OperationalTemplateScheduleKind" NOT NULL,
    "cycleStableKey" TEXT,
    "windowStartLocal" TEXT,
    "windowEndLocal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalTemplateSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalTemplateEvent" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorLabel" TEXT,
    "detailJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalTemplateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalEvidenceRecord" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateStableKey" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "templateName" TEXT NOT NULL,
    "purposeType" "OperationalTemplatePurposeType" NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "operationalDate" DATE NOT NULL,
    "scheduleKind" "OperationalTemplateScheduleKind" NOT NULL,
    "cycleStableKey" TEXT,
    "cycleLabel" TEXT,
    "windowStartLocal" TEXT,
    "windowEndLocal" TEXT,
    "unitId" TEXT,
    "spaceId" TEXT,
    "assetId" TEXT,
    "status" "OperationalEvidenceRecordStatus" NOT NULL DEFAULT 'COMPLETED',
    "outOfStandard" BOOLEAN NOT NULL DEFAULT false,
    "correctiveActionText" TEXT,
    "correctiveActionAt" TIMESTAMP(3),
    "correctiveActionByUserId" TEXT,
    "correctiveActionByEmployeeId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synchronizedAt" TIMESTAMP(3),
    "recordedOnline" BOOLEAN NOT NULL DEFAULT true,
    "clientCommandId" TEXT,
    "deviceBoundUnitId" TEXT,
    "recordedByUserId" TEXT,
    "recordedByEmployeeId" TEXT,
    "recordedByLabel" TEXT,
    "templateSnapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalEvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalEvidenceFieldValue" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "OperationalEvidenceFieldType" NOT NULL,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "valueBoolean" BOOLEAN,
    "valueDateTime" TIMESTAMP(3),
    "valueSelections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outOfStandard" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalEvidenceFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalEvidenceCorrection" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previousValuesJson" JSONB NOT NULL,
    "previousStatus" "OperationalEvidenceRecordStatus" NOT NULL,
    "previousCorrectiveActionText" TEXT,
    "correctedByUserId" TEXT,
    "correctedByEmployeeId" TEXT,
    "correctedByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalEvidenceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationalTemplate_facilityId_departmentId_status_idx" ON "OperationalTemplate"("facilityId", "departmentId", "status");

-- CreateIndex
CREATE INDEX "OperationalTemplate_facilityId_departmentId_purposeType_idx" ON "OperationalTemplate"("facilityId", "departmentId", "purposeType");

-- CreateIndex
CREATE INDEX "OperationalTemplate_departmentId_status_name_idx" ON "OperationalTemplate"("departmentId", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalTemplate_departmentId_stableKey_version_key" ON "OperationalTemplate"("departmentId", "stableKey", "version");

-- CreateIndex
CREATE INDEX "OperationalTemplateField_templateId_idx" ON "OperationalTemplateField"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalTemplateField_templateId_fieldKey_key" ON "OperationalTemplateField"("templateId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalTemplateField_templateId_displaySequence_key" ON "OperationalTemplateField"("templateId", "displaySequence");

-- CreateIndex
CREATE INDEX "OperationalTemplateApplicability_templateId_idx" ON "OperationalTemplateApplicability"("templateId");

-- CreateIndex
CREATE INDEX "OperationalTemplateApplicability_assetId_idx" ON "OperationalTemplateApplicability"("assetId");

-- CreateIndex
CREATE INDEX "OperationalTemplateApplicability_spaceId_idx" ON "OperationalTemplateApplicability"("spaceId");

-- CreateIndex
CREATE INDEX "OperationalTemplateApplicability_unitId_idx" ON "OperationalTemplateApplicability"("unitId");

-- CreateIndex
CREATE INDEX "OperationalTemplateSchedule_templateId_idx" ON "OperationalTemplateSchedule"("templateId");

-- CreateIndex
CREATE INDEX "OperationalTemplateSchedule_cycleStableKey_idx" ON "OperationalTemplateSchedule"("cycleStableKey");

-- CreateIndex
CREATE INDEX "OperationalTemplateEvent_templateId_createdAt_idx" ON "OperationalTemplateEvent"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalTemplateEvent_facilityId_departmentId_createdAt_idx" ON "OperationalTemplateEvent"("facilityId", "departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_facilityId_departmentId_operation_idx" ON "OperationalEvidenceRecord"("facilityId", "departmentId", "operationalDate");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_facilityId_departmentId_templateS_idx" ON "OperationalEvidenceRecord"("facilityId", "departmentId", "templateStableKey", "operationalDate");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_facilityId_unitId_operationalDate_idx" ON "OperationalEvidenceRecord"("facilityId", "unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_facilityId_assetId_operationalDat_idx" ON "OperationalEvidenceRecord"("facilityId", "assetId", "operationalDate");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_requirementKey_operationalDate_idx" ON "OperationalEvidenceRecord"("requirementKey", "operationalDate");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_recordedByEmployeeId_idx" ON "OperationalEvidenceRecord"("recordedByEmployeeId");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_status_idx" ON "OperationalEvidenceRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalEvidenceRecord_facilityId_departmentId_clientCom_key" ON "OperationalEvidenceRecord"("facilityId", "departmentId", "clientCommandId");

-- CreateIndex
CREATE INDEX "OperationalEvidenceFieldValue_recordId_idx" ON "OperationalEvidenceFieldValue"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalEvidenceFieldValue_recordId_fieldKey_key" ON "OperationalEvidenceFieldValue"("recordId", "fieldKey");

-- CreateIndex
CREATE INDEX "OperationalEvidenceCorrection_recordId_createdAt_idx" ON "OperationalEvidenceCorrection"("recordId", "createdAt");

-- AddForeignKey
ALTER TABLE "OperationalTemplate" ADD CONSTRAINT "OperationalTemplate_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalTemplate" ADD CONSTRAINT "OperationalTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalTemplateField" ADD CONSTRAINT "OperationalTemplateField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OperationalTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalTemplateApplicability" ADD CONSTRAINT "OperationalTemplateApplicability_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OperationalTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalTemplateApplicability" ADD CONSTRAINT "OperationalTemplateApplicability_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalTemplateApplicability" ADD CONSTRAINT "OperationalTemplateApplicability_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalTemplateSchedule" ADD CONSTRAINT "OperationalTemplateSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OperationalTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalTemplateEvent" ADD CONSTRAINT "OperationalTemplateEvent_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OperationalTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OperationalTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_recordedByEmployeeId_fkey" FOREIGN KEY ("recordedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceFieldValue" ADD CONSTRAINT "OperationalEvidenceFieldValue_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceCorrection" ADD CONSTRAINT "OperationalEvidenceCorrection_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceCorrection" ADD CONSTRAINT "OperationalEvidenceCorrection_correctedByUserId_fkey" FOREIGN KEY ("correctedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceCorrection" ADD CONSTRAINT "OperationalEvidenceCorrection_correctedByEmployeeId_fkey" FOREIGN KEY ("correctedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
