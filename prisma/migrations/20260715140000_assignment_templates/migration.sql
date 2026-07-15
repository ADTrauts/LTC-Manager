-- CreateTable
CREATE TABLE "OperationalAssignmentTemplate" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "operationDefinitionId" TEXT,
    "workShiftId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAssignmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAssignmentTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "unitId" TEXT,
    "startsAtLocal" TEXT,
    "endsAtLocal" TEXT,
    "requiredCount" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAssignmentTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationalAssignmentTemplate_facilityId_departmentId_idx" ON "OperationalAssignmentTemplate"("facilityId", "departmentId");

-- CreateIndex
CREATE INDEX "OperationalAssignmentTemplate_facilityId_isActive_idx" ON "OperationalAssignmentTemplate"("facilityId", "isActive");

-- CreateIndex
CREATE INDEX "OperationalAssignmentTemplateItem_templateId_sortOrder_idx" ON "OperationalAssignmentTemplateItem"("templateId", "sortOrder");

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplate" ADD CONSTRAINT "OperationalAssignmentTemplate_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplate" ADD CONSTRAINT "OperationalAssignmentTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplate" ADD CONSTRAINT "OperationalAssignmentTemplate_operationDefinitionId_fkey" FOREIGN KEY ("operationDefinitionId") REFERENCES "OperationDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplate" ADD CONSTRAINT "OperationalAssignmentTemplate_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplate" ADD CONSTRAINT "OperationalAssignmentTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplateItem" ADD CONSTRAINT "OperationalAssignmentTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OperationalAssignmentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplateItem" ADD CONSTRAINT "OperationalAssignmentTemplateItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
