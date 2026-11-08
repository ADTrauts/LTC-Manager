-- Restore structures still present in prisma/schema.prisma and application code.
-- The 20261103/20261104 retirement migrations were applied to production while
-- schema.prisma and src still expected these tables/columns. Empty recreate only.

-- CreateEnum
CREATE TYPE "WorkStation" AS ENUM ('COOK', 'SERVER', 'DISHWASHER', 'RETAIL', 'DIET', 'OFFICE', 'PORTER', 'UTILITY');

-- CreateEnum
CREATE TYPE "DepartmentTeamCycleNeedGrain" AS ENUM ('TOTAL', 'PER_ROOM');

-- CreateEnum
CREATE TYPE "DepartmentJobRoleTier" AS ENUM ('TEAM_MEMBER', 'LEAD', 'SUPERVISOR', 'MANAGER');

-- CreateEnum
CREATE TYPE "DepartmentJobRoleStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OperationalProfileStatus" AS ENUM ('DRAFT', 'CERTIFIED', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RoomExperienceExceptionMode" AS ENUM ('ENABLE', 'DISABLE', 'OVERRIDE');

-- CreateEnum
CREATE TYPE "DepartmentWorkPlanStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "DepartmentWorkItemPriority" AS ENUM ('ROUTINE', 'TIME_SENSITIVE', 'URGENT');

-- CreateEnum
CREATE TYPE "DepartmentWorkCompletionMode" AS ENUM ('EXPLICIT_CONFIRMATION', 'LINKED_EVIDENCE');

-- CreateEnum
CREATE TYPE "DepartmentWorkResponsibilityMode" AS ENUM ('UNIT_SHARED', 'EACH_ASSIGNED_EMPLOYEE');

-- CreateEnum
CREATE TYPE "DepartmentWorkScheduleKind" AS ENUM ('OPERATIONAL_CYCLE', 'FIXED_DAILY_WINDOW', 'ONCE_PER_OPERATIONAL_DATE');

-- CreateEnum
CREATE TYPE "DepartmentWorkDueOffsetKind" AS ENUM ('CYCLE_START', 'CYCLE_END', 'MINUTES_BEFORE_CYCLE_END');

-- CreateEnum
CREATE TYPE "DepartmentWorkApplicabilityKind" AS ENUM ('DEPARTMENT_UNIT', 'SPECIFIC_UNIT', 'SPECIFIC_SPACE', 'SPACE_TYPE', 'SPECIFIC_ASSET', 'ASSET_TYPE', 'OPERATIONAL_TYPE');

-- CreateEnum
CREATE TYPE "DepartmentWorkOccurrenceSourceKind" AS ENUM ('WORK_PLAN', 'ONE_OFF');

-- CreateEnum
CREATE TYPE "DepartmentWorkOccurrenceStatus" AS ENUM ('OPEN', 'COMPLETED', 'COMPLETED_WITH_EVIDENCE', 'NOT_REQUIRED', 'CANCELLED', 'REOPENED');

-- CreateEnum
CREATE TYPE "DepartmentWorkEventType" AS ENUM ('CREATED', 'COMPLETED', 'COMPLETED_WITH_EVIDENCE', 'NOT_REQUIRED', 'REOPENED', 'REASSIGNED', 'CANCELLED', 'CORRECTED', 'CONFLICT', 'OFFLINE_SYNCED');

-- AlterEnum
ALTER TYPE "LogAttachmentTargetKind" ADD VALUE 'OPERATIONAL_TYPE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "OperationalCycleLocationMode" ADD VALUE 'UNIT_TYPES';
ALTER TYPE "OperationalCycleLocationMode" ADD VALUE 'ROOM_TYPE';
ALTER TYPE "OperationalCycleLocationMode" ADD VALUE 'OPERATIONAL_TYPES';

-- DropForeignKey
ALTER TABLE "OperationalAssignmentTemplateItem" DROP CONSTRAINT "OperationalAssignmentTemplateItem_spaceId_fkey";

-- DropIndex
DROP INDEX "OperationalAssignmentEligibilityException_assignmentId_createdA";

-- DropIndex
DROP INDEX "OperationalAssignmentTemplateItem_spaceId_idx";

-- DropIndex
DROP INDEX "RoomAreaStatus_facilityId_statusDate_idx";

-- AlterTable
ALTER TABLE "DepartmentOperationalCycle" ADD COLUMN     "applicableOperationalTypeKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "applicableUnitTypes" "UnitType"[],
ADD COLUMN     "roomTypeKey" TEXT;

-- AlterTable
ALTER TABLE "DepartmentOperationalCycleMilestoneTime" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DepartmentTeam" ADD COLUMN     "applicableOperationalTypeKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "EmployeeDepartment" ADD COLUMN     "roleType" "RoleKey" NOT NULL DEFAULT 'STAFF';

-- AlterTable
ALTER TABLE "LogAttachment" ADD COLUMN     "operationalTypeKey" TEXT;

-- AlterTable
ALTER TABLE "OperationalAssignmentTemplateItem" DROP COLUMN "spaceId",
ADD COLUMN     "applicableOperationalTypeKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "OperationalCycleDayExpectation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ScheduleEntry" ADD COLUMN     "roleType" "RoleKey",
ADD COLUMN     "unitId" TEXT;

-- CreateTable
CREATE TABLE "DepartmentTeamCycle" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "requiredCount" INTEGER,
    "grain" "DepartmentTeamCycleNeedGrain" NOT NULL DEFAULT 'TOTAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentTeamCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentFacilityTypeLogDefault" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "facilityRoomTypeId" TEXT NOT NULL,
    "catalogDefinitionId" TEXT NOT NULL,
    "catalogStableKey" TEXT NOT NULL,
    "catalogVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentFacilityTypeLogDefault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentLocationLogSuppression" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "defaultId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentLocationLogSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentTeamRoomMembership" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentTeamRoomMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentJobRole" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "tier" "DepartmentJobRoleTier" NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "status" "DepartmentJobRoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentJobRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDepartmentJobRole" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "jobRoleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDepartmentJobRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentOperationalProfile" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "OperationalProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "baselineKey" TEXT,
    "createdByUserId" TEXT,
    "certifiedByUserId" TEXT,
    "certifiedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentOperationalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentOperationalArea" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentOperationalArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentAreaExperience" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "experienceKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "configurationJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentAreaExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentRoomArchetype" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentRoomArchetype_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentArchetypeExperience" (
    "id" TEXT NOT NULL,
    "archetypeId" TEXT NOT NULL,
    "areaExperienceId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "configurationJson" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentArchetypeExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentRoomArchetypeBinding" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "archetypeId" TEXT NOT NULL,
    "unitSpaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentRoomArchetypeBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentRoomExperienceException" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "unitSpaceId" TEXT NOT NULL,
    "areaExperienceId" TEXT NOT NULL,
    "mode" "RoomExperienceExceptionMode" NOT NULL,
    "configurationJson" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentRoomExperienceException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeWorkStation" (
    "employeeId" TEXT NOT NULL,
    "station" "WorkStation" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeWorkStation_pkey" PRIMARY KEY ("employeeId","station")
);

-- CreateTable
CREATE TABLE "DefaultAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "roleType" "RoleKey" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefaultAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentWorkPlan" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "operatorPeriodId" TEXT,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentWorkPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentWorkPlanApplicability" (
    "id" TEXT NOT NULL,
    "workPlanId" TEXT NOT NULL,
    "kind" "DepartmentWorkApplicabilityKind" NOT NULL,
    "unitId" TEXT,
    "spaceId" TEXT,
    "spaceType" "SpaceType",
    "assetId" TEXT,
    "assetType" TEXT,
    "operationalTypeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentWorkPlanApplicability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentWorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentWorkOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateIndex
CREATE INDEX "DepartmentTeamCycle_departmentId_cycleStableKey_idx" ON "DepartmentTeamCycle"("departmentId", "cycleStableKey");

-- CreateIndex
CREATE INDEX "DepartmentTeamCycle_facilityId_departmentId_idx" ON "DepartmentTeamCycle"("facilityId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentTeamCycle_teamId_cycleStableKey_key" ON "DepartmentTeamCycle"("teamId", "cycleStableKey");

-- CreateIndex
CREATE INDEX "DepartmentFacilityTypeLogDefault_facilityId_departmentId_idx" ON "DepartmentFacilityTypeLogDefault"("facilityId", "departmentId");

-- CreateIndex
CREATE INDEX "DepartmentFacilityTypeLogDefault_facilityRoomTypeId_idx" ON "DepartmentFacilityTypeLogDefault"("facilityRoomTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentFacilityTypeLogDefault_departmentId_facilityRoomT_key" ON "DepartmentFacilityTypeLogDefault"("departmentId", "facilityRoomTypeId", "catalogStableKey");

-- CreateIndex
CREATE INDEX "DepartmentLocationLogSuppression_departmentId_idx" ON "DepartmentLocationLogSuppression"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentLocationLogSuppression_spaceId_defaultId_key" ON "DepartmentLocationLogSuppression"("spaceId", "defaultId");

-- CreateIndex
CREATE INDEX "DepartmentTeamRoomMembership_spaceId_idx" ON "DepartmentTeamRoomMembership"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentTeamRoomMembership_teamId_spaceId_key" ON "DepartmentTeamRoomMembership"("teamId", "spaceId");

-- CreateIndex
CREATE INDEX "DepartmentJobRole_facilityId_departmentId_status_displayOrd_idx" ON "DepartmentJobRole"("facilityId", "departmentId", "status", "displayOrder");

-- CreateIndex
CREATE INDEX "DepartmentJobRole_departmentId_status_idx" ON "DepartmentJobRole"("departmentId", "status");

-- CreateIndex
CREATE INDEX "EmployeeDepartmentJobRole_employeeId_idx" ON "EmployeeDepartmentJobRole"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDepartmentJobRole_departmentId_idx" ON "EmployeeDepartmentJobRole"("departmentId");

-- CreateIndex
CREATE INDEX "EmployeeDepartmentJobRole_jobRoleId_idx" ON "EmployeeDepartmentJobRole"("jobRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDepartmentJobRole_employeeId_departmentId_key" ON "EmployeeDepartmentJobRole"("employeeId", "departmentId");

-- CreateIndex
CREATE INDEX "DepartmentOperationalProfile_facilityId_departmentId_status_idx" ON "DepartmentOperationalProfile"("facilityId", "departmentId", "status");

-- CreateIndex
CREATE INDEX "DepartmentOperationalProfile_departmentId_status_idx" ON "DepartmentOperationalProfile"("departmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentOperationalProfile_departmentId_version_key" ON "DepartmentOperationalProfile"("departmentId", "version");

-- CreateIndex
CREATE INDEX "DepartmentOperationalArea_profileId_sortOrder_idx" ON "DepartmentOperationalArea"("profileId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentOperationalArea_profileId_key_key" ON "DepartmentOperationalArea"("profileId", "key");

-- CreateIndex
CREATE INDEX "DepartmentAreaExperience_areaId_sortOrder_idx" ON "DepartmentAreaExperience"("areaId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentAreaExperience_areaId_experienceKey_key" ON "DepartmentAreaExperience"("areaId", "experienceKey");

-- CreateIndex
CREATE INDEX "DepartmentRoomArchetype_profileId_sortOrder_idx" ON "DepartmentRoomArchetype"("profileId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentRoomArchetype_profileId_key_key" ON "DepartmentRoomArchetype"("profileId", "key");

-- CreateIndex
CREATE INDEX "DepartmentArchetypeExperience_archetypeId_sortOrder_idx" ON "DepartmentArchetypeExperience"("archetypeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentArchetypeExperience_archetypeId_areaExperienceId_key" ON "DepartmentArchetypeExperience"("archetypeId", "areaExperienceId");

-- CreateIndex
CREATE INDEX "DepartmentRoomArchetypeBinding_archetypeId_idx" ON "DepartmentRoomArchetypeBinding"("archetypeId");

-- CreateIndex
CREATE INDEX "DepartmentRoomArchetypeBinding_unitSpaceId_idx" ON "DepartmentRoomArchetypeBinding"("unitSpaceId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentRoomArchetypeBinding_profileId_unitSpaceId_key" ON "DepartmentRoomArchetypeBinding"("profileId", "unitSpaceId");

-- CreateIndex
CREATE INDEX "DepartmentRoomExperienceException_profileId_unitSpaceId_idx" ON "DepartmentRoomExperienceException"("profileId", "unitSpaceId");

-- CreateIndex
CREATE INDEX "DepartmentRoomExperienceException_areaExperienceId_idx" ON "DepartmentRoomExperienceException"("areaExperienceId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentRoomExperienceException_profile_room_experience_key" ON "DepartmentRoomExperienceException"("profileId", "unitSpaceId", "areaExperienceId");

-- CreateIndex
CREATE INDEX "EmployeeWorkStation_employeeId_idx" ON "EmployeeWorkStation"("employeeId");

-- CreateIndex
CREATE INDEX "DefaultAssignment_unitId_isActive_idx" ON "DefaultAssignment"("unitId", "isActive");

-- CreateIndex
CREATE INDEX "DefaultAssignment_employeeId_isActive_idx" ON "DefaultAssignment"("employeeId", "isActive");

-- CreateIndex
CREATE INDEX "DepartmentWorkPlan_facilityId_departmentId_status_idx" ON "DepartmentWorkPlan"("facilityId", "departmentId", "status");

-- CreateIndex
CREATE INDEX "DepartmentWorkPlan_departmentId_status_name_idx" ON "DepartmentWorkPlan"("departmentId", "status", "name");

-- CreateIndex
CREATE INDEX "DepartmentWorkPlan_departmentId_operatorPeriodId_idx" ON "DepartmentWorkPlan"("departmentId", "operatorPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentWorkPlan_departmentId_stableKey_version_key" ON "DepartmentWorkPlan"("departmentId", "stableKey", "version");

-- CreateIndex
CREATE INDEX "DepartmentWorkPlanApplicability_workPlanId_idx" ON "DepartmentWorkPlanApplicability"("workPlanId");

-- CreateIndex
CREATE INDEX "DepartmentWorkPlanApplicability_unitId_idx" ON "DepartmentWorkPlanApplicability"("unitId");

-- CreateIndex
CREATE INDEX "DepartmentWorkPlanApplicability_assetId_idx" ON "DepartmentWorkPlanApplicability"("assetId");

-- CreateIndex
CREATE INDEX "DepartmentWorkPlanApplicability_operationalTypeKey_idx" ON "DepartmentWorkPlanApplicability"("operationalTypeKey");

-- CreateIndex
CREATE INDEX "DepartmentWorkItem_workPlanId_displaySequence_idx" ON "DepartmentWorkItem"("workPlanId", "displaySequence");

-- CreateIndex
CREATE INDEX "DepartmentWorkItem_knowledgeArticleId_idx" ON "DepartmentWorkItem"("knowledgeArticleId");

-- CreateIndex
CREATE INDEX "DepartmentWorkItem_linkedTemplateStableKey_idx" ON "DepartmentWorkItem"("linkedTemplateStableKey");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentWorkItem_workPlanId_itemKey_key" ON "DepartmentWorkItem"("workPlanId", "itemKey");

-- CreateIndex
CREATE INDEX "DepartmentWorkPlanEvent_workPlanId_createdAt_idx" ON "DepartmentWorkPlanEvent"("workPlanId", "createdAt");

-- CreateIndex
CREATE INDEX "DepartmentWorkPlanEvent_facilityId_departmentId_createdAt_idx" ON "DepartmentWorkPlanEvent"("facilityId", "departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "DepartmentWorkOccurrence_facilityId_departmentId_operationa_idx" ON "DepartmentWorkOccurrence"("facilityId", "departmentId", "operationalDate");

-- CreateIndex
CREATE INDEX "DepartmentWorkOccurrence_facilityId_unitId_operationalDate_idx" ON "DepartmentWorkOccurrence"("facilityId", "unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "DepartmentWorkOccurrence_facilityId_departmentId_status_ope_idx" ON "DepartmentWorkOccurrence"("facilityId", "departmentId", "status", "operationalDate");

-- CreateIndex
CREATE INDEX "DepartmentWorkOccurrence_assignedEmployeeId_idx" ON "DepartmentWorkOccurrence"("assignedEmployeeId");

-- CreateIndex
CREATE INDEX "DepartmentWorkOccurrence_workPlanId_idx" ON "DepartmentWorkOccurrence"("workPlanId");

-- CreateIndex
CREATE INDEX "DepartmentWorkOccurrence_workItemId_idx" ON "DepartmentWorkOccurrence"("workItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentWorkOccurrence_facilityId_departmentId_occurrence_key" ON "DepartmentWorkOccurrence"("facilityId", "departmentId", "occurrenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentWorkOccurrence_facilityId_departmentId_clientComm_key" ON "DepartmentWorkOccurrence"("facilityId", "departmentId", "clientCommandId");

-- CreateIndex
CREATE INDEX "DepartmentWorkEvent_occurrenceId_createdAt_idx" ON "DepartmentWorkEvent"("occurrenceId", "createdAt");

-- CreateIndex
CREATE INDEX "DepartmentWorkEvent_facilityId_departmentId_createdAt_idx" ON "DepartmentWorkEvent"("facilityId", "departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_createdByUserId_idx" ON "Attachment"("createdByUserId");

-- CreateIndex
CREATE INDEX "Attachment_createdByEmployeeId_idx" ON "Attachment"("createdByEmployeeId");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycle_departmentId_roomTypeKey_idx" ON "DepartmentOperationalCycle"("departmentId", "roomTypeKey");

-- CreateIndex
CREATE INDEX "LogAttachment_operationalTypeKey_idx" ON "LogAttachment"("operationalTypeKey");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalAssignmentEligibilityException_assignmentId_key" ON "OperationalAssignmentEligibilityException"("assignmentId");

-- CreateIndex
CREATE INDEX "RoomAreaStatus_facilityId_idx" ON "RoomAreaStatus"("facilityId");

-- CreateIndex
CREATE INDEX "RoomAreaStatus_unitId_statusDate_idx" ON "RoomAreaStatus"("unitId", "statusDate");

-- CreateIndex
CREATE INDEX "RoomAreaStatus_updatedByEmployeeId_idx" ON "RoomAreaStatus"("updatedByEmployeeId");

-- CreateIndex
CREATE INDEX "ScheduleEntry_date_unitId_idx" ON "ScheduleEntry"("date", "unitId");

-- AddForeignKey
ALTER TABLE "DepartmentTeamCycle" ADD CONSTRAINT "DepartmentTeamCycle_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "DepartmentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentTeamCycle" ADD CONSTRAINT "DepartmentTeamCycle_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentTeamCycle" ADD CONSTRAINT "DepartmentTeamCycle_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentFacilityTypeLogDefault" ADD CONSTRAINT "DepartmentFacilityTypeLogDefault_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentFacilityTypeLogDefault" ADD CONSTRAINT "DepartmentFacilityTypeLogDefault_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentFacilityTypeLogDefault" ADD CONSTRAINT "DepartmentFacilityTypeLogDefault_facilityRoomTypeId_fkey" FOREIGN KEY ("facilityRoomTypeId") REFERENCES "FacilityRoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentFacilityTypeLogDefault" ADD CONSTRAINT "DepartmentFacilityTypeLogDefault_catalogDefinitionId_fkey" FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentLocationLogSuppression" ADD CONSTRAINT "DepartmentLocationLogSuppression_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentLocationLogSuppression" ADD CONSTRAINT "DepartmentLocationLogSuppression_defaultId_fkey" FOREIGN KEY ("defaultId") REFERENCES "DepartmentFacilityTypeLogDefault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentTeamRoomMembership" ADD CONSTRAINT "DepartmentTeamRoomMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "DepartmentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentTeamRoomMembership" ADD CONSTRAINT "DepartmentTeamRoomMembership_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentJobRole" ADD CONSTRAINT "DepartmentJobRole_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentJobRole" ADD CONSTRAINT "DepartmentJobRole_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDepartmentJobRole" ADD CONSTRAINT "EmployeeDepartmentJobRole_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDepartmentJobRole" ADD CONSTRAINT "EmployeeDepartmentJobRole_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDepartmentJobRole" ADD CONSTRAINT "EmployeeDepartmentJobRole_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "DepartmentJobRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalProfile" ADD CONSTRAINT "DepartmentOperationalProfile_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalProfile" ADD CONSTRAINT "DepartmentOperationalProfile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalArea" ADD CONSTRAINT "DepartmentOperationalArea_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DepartmentOperationalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentAreaExperience" ADD CONSTRAINT "DepartmentAreaExperience_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "DepartmentOperationalArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentRoomArchetype" ADD CONSTRAINT "DepartmentRoomArchetype_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DepartmentOperationalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentArchetypeExperience" ADD CONSTRAINT "DepartmentArchetypeExperience_archetypeId_fkey" FOREIGN KEY ("archetypeId") REFERENCES "DepartmentRoomArchetype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentArchetypeExperience" ADD CONSTRAINT "DepartmentArchetypeExperience_areaExperienceId_fkey" FOREIGN KEY ("areaExperienceId") REFERENCES "DepartmentAreaExperience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentRoomArchetypeBinding" ADD CONSTRAINT "DepartmentRoomArchetypeBinding_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DepartmentOperationalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentRoomArchetypeBinding" ADD CONSTRAINT "DepartmentRoomArchetypeBinding_archetypeId_fkey" FOREIGN KEY ("archetypeId") REFERENCES "DepartmentRoomArchetype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentRoomArchetypeBinding" ADD CONSTRAINT "DepartmentRoomArchetypeBinding_unitSpaceId_fkey" FOREIGN KEY ("unitSpaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentRoomExperienceException" ADD CONSTRAINT "DepartmentRoomExperienceException_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DepartmentOperationalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentRoomExperienceException" ADD CONSTRAINT "DepartmentRoomExperienceException_unitSpaceId_fkey" FOREIGN KEY ("unitSpaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentRoomExperienceException" ADD CONSTRAINT "DepartmentRoomExperienceException_areaExperienceId_fkey" FOREIGN KEY ("areaExperienceId") REFERENCES "DepartmentAreaExperience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkStation" ADD CONSTRAINT "EmployeeWorkStation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultAssignment" ADD CONSTRAINT "DefaultAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultAssignment" ADD CONSTRAINT "DefaultAssignment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkPlan" ADD CONSTRAINT "DepartmentWorkPlan_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkPlan" ADD CONSTRAINT "DepartmentWorkPlan_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkPlan" ADD CONSTRAINT "DepartmentWorkPlan_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkPlan" ADD CONSTRAINT "DepartmentWorkPlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkPlan" ADD CONSTRAINT "DepartmentWorkPlan_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkPlan" ADD CONSTRAINT "DepartmentWorkPlan_retiredByUserId_fkey" FOREIGN KEY ("retiredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkPlan" ADD CONSTRAINT "DepartmentWorkPlan_lastChangedByUserId_fkey" FOREIGN KEY ("lastChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkPlanApplicability" ADD CONSTRAINT "DepartmentWorkPlanApplicability_workPlanId_fkey" FOREIGN KEY ("workPlanId") REFERENCES "DepartmentWorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkItem" ADD CONSTRAINT "DepartmentWorkItem_workPlanId_fkey" FOREIGN KEY ("workPlanId") REFERENCES "DepartmentWorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkItem" ADD CONSTRAINT "DepartmentWorkItem_knowledgeArticleId_fkey" FOREIGN KEY ("knowledgeArticleId") REFERENCES "KnowledgeArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkPlanEvent" ADD CONSTRAINT "DepartmentWorkPlanEvent_workPlanId_fkey" FOREIGN KEY ("workPlanId") REFERENCES "DepartmentWorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_workPlanId_fkey" FOREIGN KEY ("workPlanId") REFERENCES "DepartmentWorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "DepartmentWorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_originalAssignedEmployeeId_fkey" FOREIGN KEY ("originalAssignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_completedByEmployeeId_fkey" FOREIGN KEY ("completedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_notRequiredByUserId_fkey" FOREIGN KEY ("notRequiredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_reassignedByUserId_fkey" FOREIGN KEY ("reassignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkOccurrence" ADD CONSTRAINT "DepartmentWorkOccurrence_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkEvent" ADD CONSTRAINT "DepartmentWorkEvent_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "DepartmentWorkOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkEvent" ADD CONSTRAINT "DepartmentWorkEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkEvent" ADD CONSTRAINT "DepartmentWorkEvent_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;


