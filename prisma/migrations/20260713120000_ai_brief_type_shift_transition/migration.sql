-- CreateEnum
CREATE TYPE "AiBriefType" AS ENUM ('MORNING_BRIEF', 'SHIFT_TRANSITION');

-- AlterTable
ALTER TABLE "AiOperationalBrief" ADD COLUMN "briefType" "AiBriefType" NOT NULL DEFAULT 'MORNING_BRIEF';
ALTER TABLE "AiOperationalBrief" ADD COLUMN "snapshotJson" JSONB;
ALTER TABLE "AiOperationalBrief" ADD COLUMN "baselineSnapshotHash" TEXT;
ALTER TABLE "AiOperationalBrief" ADD COLUMN "windowStart" TIMESTAMP(3);
ALTER TABLE "AiOperationalBrief" ADD COLUMN "windowEnd" TIMESTAMP(3);

-- DropIndex
DROP INDEX IF EXISTS "AiOperationalBrief_facilityId_departmentKey_serviceDate_snapshotHash_key";
DROP INDEX IF EXISTS "AiOperationalBrief_facilityId_departmentKey_serviceDate_idx";
DROP INDEX IF EXISTS "AiOperationalBrief_facilityId_generatedAt_idx";

-- CreateIndex
CREATE UNIQUE INDEX "AiOperationalBrief_facilityId_departmentKey_serviceDate_briefType_snapshotHash_key" ON "AiOperationalBrief"("facilityId", "departmentKey", "serviceDate", "briefType", "snapshotHash");
CREATE INDEX "AiOperationalBrief_facilityId_departmentKey_serviceDate_briefType_idx" ON "AiOperationalBrief"("facilityId", "departmentKey", "serviceDate", "briefType");
CREATE INDEX "AiOperationalBrief_facilityId_briefType_generatedAt_idx" ON "AiOperationalBrief"("facilityId", "briefType", "generatedAt");
