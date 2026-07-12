-- AlterEnum
ALTER TYPE "TaskSourceType" ADD VALUE 'INSPECTION_OCCURRENCE';

-- CreateEnum
CREATE TYPE "InspectionCadenceType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ON_DEMAND');

-- CreateEnum
CREATE TYPE "InspectionOccurrenceStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED', 'SKIPPED');

-- AlterTable
ALTER TABLE "InspectionDefinition"
ADD COLUMN "cadenceType" "InspectionCadenceType" NOT NULL DEFAULT 'ON_DEMAND',
ADD COLUMN "dueTimeLocal" TEXT,
ADD COLUMN "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "dayOfMonth" INTEGER,
ADD COLUMN "activeFrom" DATE,
ADD COLUMN "activeUntil" DATE,
ADD COLUMN "lastGeneratedThrough" DATE;

-- CreateTable
CREATE TABLE "InspectionOccurrence" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "unitId" TEXT,
    "serviceDate" DATE NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "InspectionOccurrenceStatus" NOT NULL DEFAULT 'OPEN',
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionOccurrence_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "InspectionSubmission" ADD COLUMN "occurrenceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InspectionOccurrence_definitionId_serviceDate_key" ON "InspectionOccurrence"("definitionId", "serviceDate");

-- CreateIndex
CREATE INDEX "InspectionOccurrence_facilityId_status_dueAt_idx" ON "InspectionOccurrence"("facilityId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "InspectionOccurrence_facilityId_serviceDate_idx" ON "InspectionOccurrence"("facilityId", "serviceDate");

-- CreateIndex
CREATE INDEX "InspectionOccurrence_unitId_status_idx" ON "InspectionOccurrence"("unitId", "status");

-- CreateIndex
CREATE INDEX "InspectionOccurrence_departmentId_idx" ON "InspectionOccurrence"("departmentId");

-- CreateIndex
CREATE INDEX "InspectionOccurrence_taskId_idx" ON "InspectionOccurrence"("taskId");

-- CreateIndex
CREATE INDEX "InspectionDefinition_facilityId_cadenceType_isActive_idx" ON "InspectionDefinition"("facilityId", "cadenceType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSubmission_occurrenceId_key" ON "InspectionSubmission"("occurrenceId");

-- CreateIndex
CREATE INDEX "InspectionSubmission_occurrenceId_idx" ON "InspectionSubmission"("occurrenceId");

-- AddForeignKey
ALTER TABLE "InspectionOccurrence" ADD CONSTRAINT "InspectionOccurrence_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "InspectionDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionOccurrence" ADD CONSTRAINT "InspectionOccurrence_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionOccurrence" ADD CONSTRAINT "InspectionOccurrence_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionOccurrence" ADD CONSTRAINT "InspectionOccurrence_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionOccurrence" ADD CONSTRAINT "InspectionOccurrence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSubmission" ADD CONSTRAINT "InspectionSubmission_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "InspectionOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
