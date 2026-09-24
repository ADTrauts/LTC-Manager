-- Phase 5B: version coverage expectations (assignment templates) and let items
-- target Operational Types + Operational Cycles without copying room rows.

CREATE TYPE "OperationalAssignmentTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

ALTER TABLE "OperationalAssignmentTemplate"
ADD COLUMN "stableKey" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "status" "OperationalAssignmentTemplateStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "publishedAt" TIMESTAMP(3);

UPDATE "OperationalAssignmentTemplate"
SET
  "stableKey" = "id",
  "version" = 1,
  "status" = 'PUBLISHED',
  "publishedAt" = COALESCE("updatedAt", "createdAt");

ALTER TABLE "OperationalAssignmentTemplate"
ALTER COLUMN "stableKey" SET NOT NULL;

CREATE UNIQUE INDEX "OATemplate_stable_version_key"
ON "OperationalAssignmentTemplate"("facilityId", "departmentId", "stableKey", "version");

CREATE INDEX "OATemplate_stable_status_idx"
ON "OperationalAssignmentTemplate"("facilityId", "departmentId", "stableKey", "status");

ALTER TABLE "OperationalAssignmentTemplateItem"
ADD COLUMN "applicableOperationalTypeKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "applicableOperationalCycleStableKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
