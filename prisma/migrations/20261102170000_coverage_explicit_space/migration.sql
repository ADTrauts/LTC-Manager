-- Coverage need may name a canonical UnitSpace.
-- Location Function keys are no longer how a requirement finds a room.

ALTER TABLE "OperationalAssignmentTemplateItem" ADD COLUMN "spaceId" TEXT;

CREATE INDEX "OperationalAssignmentTemplateItem_spaceId_idx" ON "OperationalAssignmentTemplateItem"("spaceId");

ALTER TABLE "OperationalAssignmentTemplateItem" ADD CONSTRAINT "OperationalAssignmentTemplateItem_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
