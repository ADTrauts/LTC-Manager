-- LEG-06 schema cleanup. Approved October 24, 2026 after row counts on local and staging.

-- AlterEnum
CREATE TYPE "AssetStatus_new" AS ENUM ('OPERATIONAL', 'DEGRADED', 'OUT_OF_SERVICE', 'RETIRED');
ALTER TABLE "public"."Asset" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Asset" ALTER COLUMN "status" TYPE "AssetStatus_new" USING ("status"::text::"AssetStatus_new");
ALTER TABLE "AssetStatusHistory" ALTER COLUMN "fromStatus" TYPE "AssetStatus_new" USING ("fromStatus"::text::"AssetStatus_new");
ALTER TABLE "AssetStatusHistory" ALTER COLUMN "toStatus" TYPE "AssetStatus_new" USING ("toStatus"::text::"AssetStatus_new");
ALTER TYPE "AssetStatus" RENAME TO "AssetStatus_old";
ALTER TYPE "AssetStatus_new" RENAME TO "AssetStatus";
DROP TYPE "public"."AssetStatus_old";
ALTER TABLE "Asset" ALTER COLUMN "status" SET DEFAULT 'OPERATIONAL';

UPDATE "Repair" SET "status" = 'COMPLETED' WHERE "status"::text = 'CLOSED';
UPDATE "Repair" SET "status" = 'ON_HOLD', "holdReason" = COALESCE("holdReason", 'WAITING_FOR_PART') WHERE "status"::text = 'WAITING_PARTS';
UPDATE "RepairUpdate" SET "statusAfterUpdate" = 'COMPLETED' WHERE "statusAfterUpdate"::text = 'CLOSED';
UPDATE "RepairUpdate" SET "statusAfterUpdate" = 'ON_HOLD' WHERE "statusAfterUpdate"::text = 'WAITING_PARTS';
DROP INDEX IF EXISTS "Repair_pmOccurrenceId_active_key";
DROP INDEX IF EXISTS "Repair_issueType_status_idx";

-- AlterEnum
CREATE TYPE "RepairStatus_new" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_ON_VENDOR', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."Repair" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Repair" ALTER COLUMN "status" TYPE "RepairStatus_new" USING ("status"::text::"RepairStatus_new");
ALTER TABLE "RepairUpdate" ALTER COLUMN "statusAfterUpdate" TYPE "RepairStatus_new" USING ("statusAfterUpdate"::text::"RepairStatus_new");
ALTER TYPE "RepairStatus" RENAME TO "RepairStatus_old";
ALTER TYPE "RepairStatus_new" RENAME TO "RepairStatus";
DROP TYPE "public"."RepairStatus_old";
ALTER TABLE "Repair" ALTER COLUMN "status" SET DEFAULT 'OPEN';
CREATE UNIQUE INDEX "Repair_pmOccurrenceId_active_key" ON "Repair" ("pmOccurrenceId") WHERE "pmOccurrenceId" IS NOT NULL AND "status" NOT IN ('COMPLETED', 'CANCELLED');

UPDATE "Unit" SET "hierarchyRole" = 'NEIGHBORHOOD' WHERE "hierarchyRole"::text = 'LEGACY_LOCATION';
DROP INDEX IF EXISTS "Unit_hierarchyRole_idx";

-- AlterEnum
CREATE TYPE "UnitHierarchyRole_new" AS ENUM ('BUILDING', 'FLOOR', 'NEIGHBORHOOD', 'STAGED');
ALTER TABLE "Unit" ALTER COLUMN "hierarchyRole" TYPE "UnitHierarchyRole_new" USING ("hierarchyRole"::text::"UnitHierarchyRole_new");
ALTER TYPE "UnitHierarchyRole" RENAME TO "UnitHierarchyRole_old";
ALTER TYPE "UnitHierarchyRole_new" RENAME TO "UnitHierarchyRole";
DROP TYPE "public"."UnitHierarchyRole_old";
CREATE INDEX "Unit_hierarchyRole_idx" ON "Unit" ("hierarchyRole");
-- DropForeignKey
ALTER TABLE "AssetIssue" DROP CONSTRAINT "AssetIssue_workOrderId_fkey";

-- DropForeignKey
ALTER TABLE "AssignmentOverride" DROP CONSTRAINT "AssignmentOverride_changedById_fkey";

-- DropForeignKey
ALTER TABLE "AssignmentOverride" DROP CONSTRAINT "AssignmentOverride_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "AssignmentOverride" DROP CONSTRAINT "AssignmentOverride_newUnitId_fkey";

-- DropForeignKey
ALTER TABLE "AssignmentOverride" DROP CONSTRAINT "AssignmentOverride_oldUnitId_fkey";

-- DropForeignKey
ALTER TABLE "AssignmentOverride" DROP CONSTRAINT "AssignmentOverride_scheduleEntryId_fkey";

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_logSubmissionId_fkey";

-- DropForeignKey
ALTER TABLE "ConsoleTicket" DROP CONSTRAINT "ConsoleTicket_facilityId_fkey";

-- DropForeignKey
ALTER TABLE "ConsoleTicket" DROP CONSTRAINT "ConsoleTicket_openedByStaffId_fkey";

-- DropForeignKey
ALTER TABLE "ConsoleTicketMessage" DROP CONSTRAINT "ConsoleTicketMessage_authorStaffId_fkey";

-- DropForeignKey
ALTER TABLE "ConsoleTicketMessage" DROP CONSTRAINT "ConsoleTicketMessage_ticketId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionDefinition" DROP CONSTRAINT "InspectionDefinition_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionDefinition" DROP CONSTRAINT "InspectionDefinition_facilityId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionDefinition" DROP CONSTRAINT "InspectionDefinition_unitId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionDefinitionItem" DROP CONSTRAINT "InspectionDefinitionItem_definitionId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionOccurrence" DROP CONSTRAINT "InspectionOccurrence_definitionId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionOccurrence" DROP CONSTRAINT "InspectionOccurrence_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionOccurrence" DROP CONSTRAINT "InspectionOccurrence_facilityId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionOccurrence" DROP CONSTRAINT "InspectionOccurrence_taskId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionOccurrence" DROP CONSTRAINT "InspectionOccurrence_unitId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionSubmission" DROP CONSTRAINT "InspectionSubmission_definitionId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionSubmission" DROP CONSTRAINT "InspectionSubmission_facilityId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionSubmission" DROP CONSTRAINT "InspectionSubmission_occurrenceId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionSubmission" DROP CONSTRAINT "InspectionSubmission_operationInstanceId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionSubmission" DROP CONSTRAINT "InspectionSubmission_submittedByEmployeeId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionSubmission" DROP CONSTRAINT "InspectionSubmission_taskId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionSubmission" DROP CONSTRAINT "InspectionSubmission_unitId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionSubmissionItem" DROP CONSTRAINT "InspectionSubmissionItem_definitionItemId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionSubmissionItem" DROP CONSTRAINT "InspectionSubmissionItem_submissionId_fkey";

-- DropForeignKey
ALTER TABLE "KnowledgeArticleInspectionDefinition" DROP CONSTRAINT "KnowledgeArticleInspectionDefinition_articleId_fkey";

-- DropForeignKey
ALTER TABLE "KnowledgeArticleInspectionDefinition" DROP CONSTRAINT "KnowledgeArticleInspectionDefinition_inspectionDefinitionId_fke";

-- DropForeignKey
ALTER TABLE "KnowledgeArticleLogTemplate" DROP CONSTRAINT "KnowledgeArticleLogTemplate_articleId_fkey";

-- DropForeignKey
ALTER TABLE "KnowledgeArticleLogTemplate" DROP CONSTRAINT "KnowledgeArticleLogTemplate_logTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "LogAssignment" DROP CONSTRAINT "LogAssignment_templateId_fkey";

-- DropForeignKey
ALTER TABLE "LogAssignment" DROP CONSTRAINT "LogAssignment_unitId_fkey";

-- DropForeignKey
ALTER TABLE "LogSubmission" DROP CONSTRAINT "LogSubmission_assignmentId_fkey";

-- DropForeignKey
ALTER TABLE "LogSubmission" DROP CONSTRAINT "LogSubmission_submittedByEmployeeId_fkey";

-- DropForeignKey
ALTER TABLE "LogSubmission" DROP CONSTRAINT "LogSubmission_submittedById_fkey";

-- DropForeignKey
ALTER TABLE "LogSubmission" DROP CONSTRAINT "LogSubmission_templateId_fkey";

-- DropForeignKey
ALTER TABLE "LogSubmission" DROP CONSTRAINT "LogSubmission_unitId_fkey";

-- DropForeignKey
ALTER TABLE "LogSubmissionValue" DROP CONSTRAINT "LogSubmissionValue_fieldId_fkey";

-- DropForeignKey
ALTER TABLE "LogSubmissionValue" DROP CONSTRAINT "LogSubmissionValue_submissionId_fkey";

-- DropForeignKey
ALTER TABLE "LogTemplate" DROP CONSTRAINT "LogTemplate_createdByRoleId_fkey";

-- DropForeignKey
ALTER TABLE "LogTemplate" DROP CONSTRAINT "LogTemplate_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "LogTemplate" DROP CONSTRAINT "LogTemplate_facilityId_fkey";

-- DropForeignKey
ALTER TABLE "LogTemplateField" DROP CONSTRAINT "LogTemplateField_templateId_fkey";

-- DropForeignKey
ALTER TABLE "OperationDefinition" DROP CONSTRAINT "OperationDefinition_facilityId_fkey";

-- DropForeignKey
ALTER TABLE "OperationInstance" DROP CONSTRAINT "OperationInstance_definitionId_fkey";

-- DropForeignKey
ALTER TABLE "OperationInstance" DROP CONSTRAINT "OperationInstance_facilityId_fkey";

-- DropForeignKey
ALTER TABLE "OperationalAssignment" DROP CONSTRAINT "OperationalAssignment_operationInstanceId_fkey";

-- DropForeignKey
ALTER TABLE "OperationalAssignmentTemplate" DROP CONSTRAINT "OperationalAssignmentTemplate_operationDefinitionId_fkey";

-- DropForeignKey
ALTER TABLE "OperationalEvidenceRecord" DROP CONSTRAINT "OperationalEvidenceRecord_templateId_fkey";

-- DropForeignKey
ALTER TABLE "OperationalTemplate" DROP CONSTRAINT "OperationalTemplate_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "OperationalTemplate" DROP CONSTRAINT "OperationalTemplate_facilityId_fkey";

-- DropForeignKey
ALTER TABLE "OperationalTemplateApplicability" DROP CONSTRAINT "OperationalTemplateApplicability_assetId_fkey";

-- DropForeignKey
ALTER TABLE "OperationalTemplateApplicability" DROP CONSTRAINT "OperationalTemplateApplicability_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "OperationalTemplateApplicability" DROP CONSTRAINT "OperationalTemplateApplicability_templateId_fkey";

-- DropForeignKey
ALTER TABLE "OperationalTemplateEvent" DROP CONSTRAINT "OperationalTemplateEvent_templateId_fkey";

-- DropForeignKey
ALTER TABLE "OperationalTemplateField" DROP CONSTRAINT "OperationalTemplateField_templateId_fkey";

-- DropForeignKey
ALTER TABLE "OperationalTemplateSchedule" DROP CONSTRAINT "OperationalTemplateSchedule_templateId_fkey";

-- DropForeignKey
ALTER TABLE "PreventiveMaintenancePlanRecordRequirement" DROP CONSTRAINT "PreventiveMaintenancePlanRecordRequirement_templateId_fkey";

-- DropForeignKey
ALTER TABLE "PreventiveMaintenanceSchedule" DROP CONSTRAINT "PreventiveMaintenanceSchedule_assetId_fkey";

-- DropForeignKey
ALTER TABLE "PreventiveMaintenanceSchedule" DROP CONSTRAINT "PreventiveMaintenanceSchedule_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "PreventiveMaintenanceSchedule" DROP CONSTRAINT "PreventiveMaintenanceSchedule_facilityId_fkey";

-- DropForeignKey
ALTER TABLE "RecordEngineRollout" DROP CONSTRAINT "RecordEngineRollout_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "RecordEngineRollout" DROP CONSTRAINT "RecordEngineRollout_facilityId_fkey";

-- DropForeignKey
ALTER TABLE "Repair" DROP CONSTRAINT "Repair_preventiveScheduleId_fkey";

-- DropForeignKey
ALTER TABLE "RepairRecordRequirement" DROP CONSTRAINT "RepairRecordRequirement_templateId_fkey";

-- DropForeignKey
ALTER TABLE "RoleRoutePermission" DROP CONSTRAINT "RoleRoutePermission_appRouteId_fkey";

-- DropForeignKey
ALTER TABLE "RoleRoutePermission" DROP CONSTRAINT "RoleRoutePermission_roleId_fkey";

-- DropForeignKey
ALTER TABLE "ServeryMealServiceEvent" DROP CONSTRAINT "ServeryMealServiceEvent_operationInstanceId_fkey";

-- DropForeignKey
ALTER TABLE "ServeryMealServiceEvent" DROP CONSTRAINT "ServeryMealServiceEvent_readyRecordedByEmployeeId_fkey";

-- DropForeignKey
ALTER TABLE "ServeryMealServiceEvent" DROP CONSTRAINT "ServeryMealServiceEvent_readyRecordedById_fkey";

-- DropForeignKey
ALTER TABLE "ServeryMealServiceEvent" DROP CONSTRAINT "ServeryMealServiceEvent_startedRecordedByEmployeeId_fkey";

-- DropForeignKey
ALTER TABLE "ServeryMealServiceEvent" DROP CONSTRAINT "ServeryMealServiceEvent_startedRecordedById_fkey";

-- DropForeignKey
ALTER TABLE "ServeryMealServiceEvent" DROP CONSTRAINT "ServeryMealServiceEvent_unitId_fkey";

-- DropForeignKey
ALTER TABLE "ServeryMilestoneEntry" DROP CONSTRAINT "ServeryMilestoneEntry_actorEmployeeId_fkey";

-- DropForeignKey
ALTER TABLE "ServeryMilestoneEntry" DROP CONSTRAINT "ServeryMilestoneEntry_actorUserId_fkey";

-- DropForeignKey
ALTER TABLE "ServeryMilestoneEntry" DROP CONSTRAINT "ServeryMilestoneEntry_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_assignedEmployeeId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_facilityId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_operationInstanceId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_unitId_fkey";

-- DropForeignKey
ALTER TABLE "UnitMealTime" DROP CONSTRAINT "UnitMealTime_unitId_fkey";

-- DropIndex
DROP INDEX "AssetIssue_workOrderId_key";

-- DropIndex
DROP INDEX "Attachment_logSubmissionId_idx";

-- DropIndex
DROP INDEX "OperationalAssignment_operationInstanceId_idx";

-- DropIndex
DROP INDEX "PreventiveMaintenancePlanRecordRequirement_templateId_idx";

-- DropIndex
-- DropIndex
DROP INDEX "RepairRecordRequirement_repairId_templateId_key";

-- DropIndex
DROP INDEX "RepairRecordRequirement_templateId_idx";

-- AlterTable
ALTER TABLE "AiOperationalBrief" DROP COLUMN "operationInstanceId";

-- AlterTable
ALTER TABLE "AssetIssue" DROP COLUMN "workOrderId";

-- AlterTable
ALTER TABLE "Attachment" DROP COLUMN "logSubmissionId";

-- AlterTable
ALTER TABLE "OperationalAssignment" DROP COLUMN "operationInstanceId";

-- AlterTable
ALTER TABLE "OperationalAssignmentTemplate" DROP COLUMN "operationDefinitionId";

-- AlterTable
ALTER TABLE "OperationalEvidenceRecord" DROP COLUMN "templateId";

-- AlterTable
ALTER TABLE "PreventiveMaintenancePlanRecordRequirement" DROP COLUMN "templateId";

-- AlterTable
ALTER TABLE "Repair" DROP COLUMN "issueType",
DROP COLUMN "preventiveScheduleId",
DROP COLUMN "resolution";

-- AlterTable
ALTER TABLE "RepairRecordRequirement" DROP COLUMN "templateId";

-- DropTable
DROP TABLE "AppRoute";

-- DropTable
DROP TABLE "AssignmentOverride";

-- DropTable
DROP TABLE "ConsoleTicket";

-- DropTable
DROP TABLE "ConsoleTicketMessage";

-- DropTable
DROP TABLE "InspectionDefinition";

-- DropTable
DROP TABLE "InspectionDefinitionItem";

-- DropTable
DROP TABLE "InspectionOccurrence";

-- DropTable
DROP TABLE "InspectionSubmission";

-- DropTable
DROP TABLE "InspectionSubmissionItem";

-- DropTable
DROP TABLE "KnowledgeArticleInspectionDefinition";

-- DropTable
DROP TABLE "KnowledgeArticleLogTemplate";

-- DropTable
DROP TABLE "LogAssignment";

-- DropTable
DROP TABLE "LogSubmission";

-- DropTable
DROP TABLE "LogSubmissionValue";

-- DropTable
DROP TABLE "LogTemplate";

-- DropTable
DROP TABLE "LogTemplateField";

-- DropTable
DROP TABLE "OperationDefinition";

-- DropTable
DROP TABLE "OperationInstance";

-- DropTable
DROP TABLE "OperationalTemplate";

-- DropTable
DROP TABLE "OperationalTemplateApplicability";

-- DropTable
DROP TABLE "OperationalTemplateEvent";

-- DropTable
DROP TABLE "OperationalTemplateField";

-- DropTable
DROP TABLE "OperationalTemplateSchedule";

-- DropTable
DROP TABLE "PreventiveMaintenanceSchedule";

-- DropTable
DROP TABLE "RecordEngineRollout";

-- DropTable
DROP TABLE "RoleRoutePermission";

-- DropTable
DROP TABLE "ServeryMealServiceEvent";

-- DropTable
DROP TABLE "ServeryMilestoneEntry";

-- DropTable
DROP TABLE "Task";

-- DropTable
DROP TABLE "UnitMealTime";

-- DropEnum
DROP TYPE "ConsoleTicketStatus";

-- DropEnum
DROP TYPE "IssueType";

-- DropEnum
DROP TYPE "OperationInstanceStatus";

-- DropEnum
DROP TYPE "RecordEngineMode";
