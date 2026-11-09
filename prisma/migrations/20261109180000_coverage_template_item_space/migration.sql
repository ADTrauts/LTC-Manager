-- Phase 2D-5: explicit Space targeting for Coverage template items.
-- Forward-only additive. Does not convert legacy OT keys.
-- Compatible with schema after 20261106214500 restore (which dropped a prior spaceId).

ALTER TABLE "OperationalAssignmentTemplateItem" ADD COLUMN "spaceId" TEXT;

CREATE INDEX "OperationalAssignmentTemplateItem_spaceId_idx" ON "OperationalAssignmentTemplateItem"("spaceId");

ALTER TABLE "OperationalAssignmentTemplateItem" ADD CONSTRAINT "OperationalAssignmentTemplateItem_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
