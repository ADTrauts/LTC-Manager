-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('LOG', 'REPAIR', 'INSPECTION', 'COVERAGE', 'AD_HOC');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskSourceType" AS ENUM ('LOG_SUBMISSION', 'REPAIR');

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "unitId" TEXT,
    "operationInstanceId" TEXT,
    "type" "TaskType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assignedEmployeeId" TEXT,
    "sourceType" "TaskSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_facilityId_status_idx" ON "Task"("facilityId", "status");

-- CreateIndex
CREATE INDEX "Task_facilityId_type_idx" ON "Task"("facilityId", "type");

-- CreateIndex
CREATE INDEX "Task_unitId_idx" ON "Task"("unitId");

-- CreateIndex
CREATE INDEX "Task_departmentId_idx" ON "Task"("departmentId");

-- CreateIndex
CREATE INDEX "Task_assignedEmployeeId_idx" ON "Task"("assignedEmployeeId");

-- CreateIndex
CREATE INDEX "Task_operationInstanceId_idx" ON "Task"("operationInstanceId");

-- CreateIndex
CREATE INDEX "Task_dueAt_idx" ON "Task"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_facilityId_sourceType_sourceId_key" ON "Task"("facilityId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_operationInstanceId_fkey" FOREIGN KEY ("operationInstanceId") REFERENCES "OperationInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
