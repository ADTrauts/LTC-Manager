-- AlterTable: add templateItemId to OperationalAssignment
ALTER TABLE "OperationalAssignment" ADD COLUMN "templateItemId" TEXT;

-- CreateTable
CREATE TABLE "OperationalAssignmentEvent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalAssignmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationalAssignment_templateItemId_idx" ON "OperationalAssignment"("templateItemId");

-- CreateIndex
CREATE INDEX "OperationalAssignmentEvent_assignmentId_createdAt_idx" ON "OperationalAssignmentEvent"("assignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalAssignmentEvent_facilityId_createdAt_idx" ON "OperationalAssignmentEvent"("facilityId", "createdAt");

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "OperationalAssignmentTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentEvent" ADD CONSTRAINT "OperationalAssignmentEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "OperationalAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentEvent" ADD CONSTRAINT "OperationalAssignmentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
