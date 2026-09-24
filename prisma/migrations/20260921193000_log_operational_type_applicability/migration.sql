-- Canonical Logs may target a department-scoped Operational Type.
-- Identity is DepartmentRoomArchetype.key, not display name and not an archetype row id.

ALTER TYPE "LogAttachmentTargetKind" ADD VALUE IF NOT EXISTS 'OPERATIONAL_TYPE';

ALTER TABLE "LogAttachment"
ADD COLUMN IF NOT EXISTS "operationalTypeKey" TEXT;

CREATE INDEX IF NOT EXISTS "LogAttachment_operationalTypeKey_idx"
ON "LogAttachment"("operationalTypeKey");
