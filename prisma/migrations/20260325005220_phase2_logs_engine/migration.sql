-- CreateEnum
CREATE TYPE "LogRecurrence" AS ENUM ('DAILY', 'PER_MEAL', 'WEEKLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LogFieldType" AS ENUM ('YES_NO', 'NUMBER', 'TEMPERATURE', 'DROPDOWN', 'SHORT_TEXT', 'LONG_TEXT', 'PASS_FAIL');

-- CreateEnum
CREATE TYPE "LogSubmissionStatus" AS ENUM ('COMPLETED', 'FAILED', 'MISSED');

-- CreateTable
CREATE TABLE "LogTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "recurrence" "LogRecurrence" NOT NULL DEFAULT 'DAILY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByRoleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogTemplateField" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "LogFieldType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "fieldOrder" INTEGER NOT NULL,
    "unitLabel" TEXT,
    "fieldOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogTemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAssignment" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "recurrence" "LogRecurrence" NOT NULL,
    "mealType" "MealType",
    "timesPerDay" INTEGER NOT NULL DEFAULT 1,
    "requiredRole" "RoleKey",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogSubmission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "mealType" "MealType",
    "submittedById" TEXT,
    "status" "LogSubmissionStatus" NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "correctiveAction" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogSubmissionValue" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "valueBoolean" BOOLEAN,
    "valueDateTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogSubmissionValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LogTemplate_name_key" ON "LogTemplate"("name");

-- CreateIndex
CREATE INDEX "LogTemplate_category_isActive_idx" ON "LogTemplate"("category", "isActive");

-- CreateIndex
CREATE INDEX "LogTemplateField_templateId_idx" ON "LogTemplateField"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "LogTemplateField_templateId_fieldOrder_key" ON "LogTemplateField"("templateId", "fieldOrder");

-- CreateIndex
CREATE INDEX "LogAssignment_unitId_isActive_idx" ON "LogAssignment"("unitId", "isActive");

-- CreateIndex
CREATE INDEX "LogAssignment_templateId_isActive_idx" ON "LogAssignment"("templateId", "isActive");

-- CreateIndex
CREATE INDEX "LogSubmission_unitId_serviceDate_idx" ON "LogSubmission"("unitId", "serviceDate");

-- CreateIndex
CREATE INDEX "LogSubmission_templateId_serviceDate_idx" ON "LogSubmission"("templateId", "serviceDate");

-- CreateIndex
CREATE INDEX "LogSubmission_submittedById_idx" ON "LogSubmission"("submittedById");

-- CreateIndex
CREATE INDEX "LogSubmissionValue_submissionId_idx" ON "LogSubmissionValue"("submissionId");

-- CreateIndex
CREATE INDEX "LogSubmissionValue_fieldId_idx" ON "LogSubmissionValue"("fieldId");

-- AddForeignKey
ALTER TABLE "LogTemplate" ADD CONSTRAINT "LogTemplate_createdByRoleId_fkey" FOREIGN KEY ("createdByRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogTemplateField" ADD CONSTRAINT "LogTemplateField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LogTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAssignment" ADD CONSTRAINT "LogAssignment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAssignment" ADD CONSTRAINT "LogAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LogTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogSubmission" ADD CONSTRAINT "LogSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "LogAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogSubmission" ADD CONSTRAINT "LogSubmission_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogSubmission" ADD CONSTRAINT "LogSubmission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LogTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogSubmission" ADD CONSTRAINT "LogSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogSubmissionValue" ADD CONSTRAINT "LogSubmissionValue_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "LogSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogSubmissionValue" ADD CONSTRAINT "LogSubmissionValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "LogTemplateField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
