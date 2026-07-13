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

-- CreateIndex (explicit short names — PG truncates identifiers to 63 chars)
CREATE UNIQUE INDEX "AiBrief_fac_dept_svc_type_hash_key" ON "AiOperationalBrief"("facilityId", "departmentKey", "serviceDate", "briefType", "snapshotHash");
CREATE INDEX "AiBrief_fac_dept_svc_type_idx" ON "AiOperationalBrief"("facilityId", "departmentKey", "serviceDate", "briefType");
CREATE INDEX "AiBrief_fac_type_generated_idx" ON "AiOperationalBrief"("facilityId", "briefType", "generatedAt");
