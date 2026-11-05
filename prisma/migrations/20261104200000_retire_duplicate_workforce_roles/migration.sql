-- Retire duplicate workforce role stores. Operational eligibility stays.
-- No qualification rows are copied from the retired tables.

DROP TABLE "EmployeeDepartmentJobRole";
DROP TABLE "DepartmentJobRole";
DROP TYPE "DepartmentJobRoleStatus";
DROP TYPE "DepartmentJobRoleTier";

DROP TABLE "DefaultAssignment";
DROP TABLE "EmployeeWorkStation";
DROP TYPE "WorkStation";

ALTER TABLE "EmployeeDepartment" DROP COLUMN "roleType";

ALTER TABLE "ScheduleEntry" DROP CONSTRAINT "ScheduleEntry_unitId_fkey";
DROP INDEX "ScheduleEntry_date_unitId_idx";
ALTER TABLE "ScheduleEntry" DROP COLUMN "roleType";
ALTER TABLE "ScheduleEntry" DROP COLUMN "unitId";

DROP INDEX "OperationalAssignmentEligibilityException_assignmentId_key";
CREATE INDEX "OperationalAssignmentEligibilityException_assignmentId_createdAt_idx" ON "OperationalAssignmentEligibilityException"("assignmentId", "createdAt");
