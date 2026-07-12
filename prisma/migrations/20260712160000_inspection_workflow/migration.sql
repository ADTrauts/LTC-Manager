-- AlterEnum
ALTER TYPE "TaskSourceType" ADD VALUE 'INSPECTION_SUBMISSION';

-- CreateEnum
CREATE TYPE "InspectionResponseType" AS ENUM ('PASS_FAIL', 'YES_NO', 'TEXT', 'NUMBER', 'TEMPERATURE');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PASSED', 'PASSED_WITH_FINDINGS', 'FAILED');

-- CreateTable
CREATE TABLE "InspectionDefinition" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "unitId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "frequency" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionDefinitionItem" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "responseType" "InspectionResponseType" NOT NULL,
    "failureCreatesFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionDefinitionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionSubmission" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "unitId" TEXT,
    "operationInstanceId" TEXT,
    "submittedByEmployeeId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "InspectionResult" NOT NULL,
    "notes" TEXT,
    "taskId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionSubmissionItem" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "definitionItemId" TEXT NOT NULL,
    "passed" BOOLEAN,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionSubmissionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspectionDefinition_facilityId_isActive_idx" ON "InspectionDefinition"("facilityId", "isActive");

-- CreateIndex
CREATE INDEX "InspectionDefinition_departmentId_idx" ON "InspectionDefinition"("departmentId");

-- CreateIndex
CREATE INDEX "InspectionDefinition_unitId_idx" ON "InspectionDefinition"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionDefinition_facilityId_name_key" ON "InspectionDefinition"("facilityId", "name");

-- CreateIndex
CREATE INDEX "InspectionDefinitionItem_definitionId_idx" ON "InspectionDefinitionItem"("definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionDefinitionItem_definitionId_sortOrder_key" ON "InspectionDefinitionItem"("definitionId", "sortOrder");

-- CreateIndex
CREATE INDEX "InspectionSubmission_facilityId_submittedAt_idx" ON "InspectionSubmission"("facilityId", "submittedAt");

-- CreateIndex
CREATE INDEX "InspectionSubmission_definitionId_submittedAt_idx" ON "InspectionSubmission"("definitionId", "submittedAt");

-- CreateIndex
CREATE INDEX "InspectionSubmission_unitId_idx" ON "InspectionSubmission"("unitId");

-- CreateIndex
CREATE INDEX "InspectionSubmission_operationInstanceId_idx" ON "InspectionSubmission"("operationInstanceId");

-- CreateIndex
CREATE INDEX "InspectionSubmission_submittedByEmployeeId_idx" ON "InspectionSubmission"("submittedByEmployeeId");

-- CreateIndex
CREATE INDEX "InspectionSubmission_taskId_idx" ON "InspectionSubmission"("taskId");

-- CreateIndex
CREATE INDEX "InspectionSubmission_result_idx" ON "InspectionSubmission"("result");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSubmission_facilityId_idempotencyKey_key" ON "InspectionSubmission"("facilityId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "InspectionSubmissionItem_submissionId_idx" ON "InspectionSubmissionItem"("submissionId");

-- CreateIndex
CREATE INDEX "InspectionSubmissionItem_definitionItemId_idx" ON "InspectionSubmissionItem"("definitionItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSubmissionItem_submissionId_definitionItemId_key" ON "InspectionSubmissionItem"("submissionId", "definitionItemId");

-- AddForeignKey
ALTER TABLE "InspectionDefinition" ADD CONSTRAINT "InspectionDefinition_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionDefinition" ADD CONSTRAINT "InspectionDefinition_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionDefinition" ADD CONSTRAINT "InspectionDefinition_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionDefinitionItem" ADD CONSTRAINT "InspectionDefinitionItem_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "InspectionDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSubmission" ADD CONSTRAINT "InspectionSubmission_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSubmission" ADD CONSTRAINT "InspectionSubmission_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "InspectionDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSubmission" ADD CONSTRAINT "InspectionSubmission_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSubmission" ADD CONSTRAINT "InspectionSubmission_operationInstanceId_fkey" FOREIGN KEY ("operationInstanceId") REFERENCES "OperationInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSubmission" ADD CONSTRAINT "InspectionSubmission_submittedByEmployeeId_fkey" FOREIGN KEY ("submittedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSubmission" ADD CONSTRAINT "InspectionSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSubmissionItem" ADD CONSTRAINT "InspectionSubmissionItem_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "InspectionSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSubmissionItem" ADD CONSTRAINT "InspectionSubmissionItem_definitionItemId_fkey" FOREIGN KEY ("definitionItemId") REFERENCES "InspectionDefinitionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
