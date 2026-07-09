-- CreateEnum
CREATE TYPE "UnitDepartmentKind" AS ENUM ('PRIMARY', 'BACKUP');

-- CreateEnum
CREATE TYPE "WorkOrderKind" AS ENUM ('CORRECTIVE', 'PREVENTIVE');

-- CreateEnum
CREATE TYPE "PreventiveMaintenanceCadence" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "RoomAreaOperationalStatus" AS ENUM ('CLEAN', 'DIRTY', 'OCCUPIED', 'DISCHARGE', 'ISOLATION', 'TERMINAL_CLEAN_PENDING');

-- CreateEnum
CREATE TYPE "AttachmentParentKind" AS ENUM ('LOG_SUBMISSION', 'REPAIR');

-- AlterEnum (UnitType) — append-only; re-run safe only if values not yet added.
ALTER TYPE "UnitType" ADD VALUE 'RESIDENT_AREA';
ALTER TYPE "UnitType" ADD VALUE 'COMMON_AREA';
ALTER TYPE "UnitType" ADD VALUE 'MECHANICAL';
ALTER TYPE "UnitType" ADD VALUE 'RESTROOM_CLUSTER';
ALTER TYPE "UnitType" ADD VALUE 'EVS_ZONE';
ALTER TYPE "UnitType" ADD VALUE 'GROUND';

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitDepartmentResponsibility" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "kind" "UnitDepartmentKind" NOT NULL DEFAULT 'PRIMARY',
    "riskLevel" TEXT,
    "cleaningFrequency" TEXT,
    "inspectionFrequency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitDepartmentResponsibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTitle" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDepartment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkShift" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "name" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventiveMaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "departmentId" TEXT,
    "name" TEXT NOT NULL,
    "cadence" "PreventiveMaintenanceCadence" NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreventiveMaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomAreaStatus" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "statusDate" DATE NOT NULL,
    "status" "RoomAreaOperationalStatus" NOT NULL,
    "notes" TEXT,
    "updatedByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomAreaStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "parentKind" "AttachmentParentKind" NOT NULL,
    "logSubmissionId" TEXT,
    "repairId" TEXT,
    "fileRelativePath" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- AlterTable User
ALTER TABLE "User" ADD COLUMN "primaryDepartmentId" TEXT;

-- AlterTable Employee
ALTER TABLE "Employee" ADD COLUMN "primaryDepartmentId" TEXT;
ALTER TABLE "Employee" ADD COLUMN "jobTitleId" TEXT;

-- AlterTable Asset
ALTER TABLE "Asset" ADD COLUMN "departmentId" TEXT;

-- AlterTable LogTemplate
ALTER TABLE "LogTemplate" ADD COLUMN "departmentId" TEXT;

-- AlterTable Repair
ALTER TABLE "Repair" ADD COLUMN "workOrderKind" "WorkOrderKind" NOT NULL DEFAULT 'CORRECTIVE';
ALTER TABLE "Repair" ADD COLUMN "requestingDepartmentId" TEXT;
ALTER TABLE "Repair" ADD COLUMN "responsibleDepartmentId" TEXT;
ALTER TABLE "Repair" ADD COLUMN "assignedEmployeeId" TEXT;
ALTER TABLE "Repair" ADD COLUMN "preventiveScheduleId" TEXT;
ALTER TABLE "Repair" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "Repair" ADD COLUMN "estimatedLaborMinutes" INTEGER;
ALTER TABLE "Repair" ADD COLUMN "partsNote" TEXT;

-- AlterTable ScheduleEntry
ALTER TABLE "ScheduleEntry" ADD COLUMN "workShiftId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Department_facilityId_key_key" ON "Department"("facilityId", "key");

-- CreateIndex
CREATE INDEX "Department_facilityId_idx" ON "Department"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitDepartmentResponsibility_unitId_departmentId_key" ON "UnitDepartmentResponsibility"("unitId", "departmentId");

-- CreateIndex
CREATE INDEX "UnitDepartmentResponsibility_unitId_idx" ON "UnitDepartmentResponsibility"("unitId");

-- CreateIndex
CREATE INDEX "UnitDepartmentResponsibility_departmentId_idx" ON "UnitDepartmentResponsibility"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "JobTitle_facilityId_name_key" ON "JobTitle"("facilityId", "name");

-- CreateIndex
CREATE INDEX "JobTitle_facilityId_idx" ON "JobTitle"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDepartment_employeeId_departmentId_key" ON "EmployeeDepartment"("employeeId", "departmentId");

-- CreateIndex
CREATE INDEX "EmployeeDepartment_employeeId_idx" ON "EmployeeDepartment"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDepartment_departmentId_idx" ON "EmployeeDepartment"("departmentId");

-- CreateIndex
CREATE INDEX "WorkShift_facilityId_idx" ON "WorkShift"("facilityId");

-- CreateIndex
CREATE INDEX "WorkShift_departmentId_idx" ON "WorkShift"("departmentId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceSchedule_facilityId_idx" ON "PreventiveMaintenanceSchedule"("facilityId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceSchedule_assetId_idx" ON "PreventiveMaintenanceSchedule"("assetId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceSchedule_nextDueAt_idx" ON "PreventiveMaintenanceSchedule"("nextDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoomAreaStatus_unitId_statusDate_key" ON "RoomAreaStatus"("unitId", "statusDate");

-- CreateIndex
CREATE INDEX "RoomAreaStatus_facilityId_statusDate_idx" ON "RoomAreaStatus"("facilityId", "statusDate");

-- CreateIndex
CREATE INDEX "Attachment_facilityId_idx" ON "Attachment"("facilityId");

-- CreateIndex
CREATE INDEX "Attachment_logSubmissionId_idx" ON "Attachment"("logSubmissionId");

-- CreateIndex
CREATE INDEX "Attachment_repairId_idx" ON "Attachment"("repairId");

-- CreateIndex
CREATE INDEX "User_primaryDepartmentId_idx" ON "User"("primaryDepartmentId");

-- CreateIndex
CREATE INDEX "Employee_primaryDepartmentId_idx" ON "Employee"("primaryDepartmentId");

-- CreateIndex
CREATE INDEX "Employee_jobTitleId_idx" ON "Employee"("jobTitleId");

-- CreateIndex
CREATE INDEX "Asset_departmentId_idx" ON "Asset"("departmentId");

-- CreateIndex
CREATE INDEX "LogTemplate_departmentId_idx" ON "LogTemplate"("departmentId");

-- CreateIndex
CREATE INDEX "Repair_requestingDepartmentId_idx" ON "Repair"("requestingDepartmentId");

-- CreateIndex
CREATE INDEX "Repair_responsibleDepartmentId_idx" ON "Repair"("responsibleDepartmentId");

-- CreateIndex
CREATE INDEX "Repair_assignedEmployeeId_idx" ON "Repair"("assignedEmployeeId");

-- CreateIndex
CREATE INDEX "Repair_dueAt_idx" ON "Repair"("dueAt");

-- CreateIndex
CREATE INDEX "ScheduleEntry_workShiftId_idx" ON "ScheduleEntry"("workShiftId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitDepartmentResponsibility" ADD CONSTRAINT "UnitDepartmentResponsibility_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitDepartmentResponsibility" ADD CONSTRAINT "UnitDepartmentResponsibility_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTitle" ADD CONSTRAINT "JobTitle_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDepartment" ADD CONSTRAINT "EmployeeDepartment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDepartment" ADD CONSTRAINT "EmployeeDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceSchedule" ADD CONSTRAINT "PreventiveMaintenanceSchedule_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceSchedule" ADD CONSTRAINT "PreventiveMaintenanceSchedule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceSchedule" ADD CONSTRAINT "PreventiveMaintenanceSchedule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAreaStatus" ADD CONSTRAINT "RoomAreaStatus_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAreaStatus" ADD CONSTRAINT "RoomAreaStatus_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAreaStatus" ADD CONSTRAINT "RoomAreaStatus_updatedByEmployeeId_fkey" FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_logSubmissionId_fkey" FOREIGN KEY ("logSubmissionId") REFERENCES "LogSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_primaryDepartmentId_fkey" FOREIGN KEY ("primaryDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_primaryDepartmentId_fkey" FOREIGN KEY ("primaryDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogTemplate" ADD CONSTRAINT "LogTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_requestingDepartmentId_fkey" FOREIGN KEY ("requestingDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_responsibleDepartmentId_fkey" FOREIGN KEY ("responsibleDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_preventiveScheduleId_fkey" FOREIGN KEY ("preventiveScheduleId") REFERENCES "PreventiveMaintenanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
