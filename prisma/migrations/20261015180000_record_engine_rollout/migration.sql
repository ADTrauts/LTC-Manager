-- Scoped Record-engine authority. Rows are append-only history by service date.

CREATE TYPE "RecordEngineMode" AS ENUM ('LEGACY', 'CANONICAL');

CREATE TABLE "RecordEngineRollout" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "mode" "RecordEngineMode" NOT NULL,
  "effectiveFromServiceDate" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecordEngineRollout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecordEngineRollout_scope_date_key"
  ON "RecordEngineRollout"("facilityId", "departmentId", "effectiveFromServiceDate");
CREATE INDEX "RecordEngineRollout_scope_date_idx"
  ON "RecordEngineRollout"("facilityId", "departmentId", "effectiveFromServiceDate");

ALTER TABLE "RecordEngineRollout"
  ADD CONSTRAINT "RecordEngineRollout_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordEngineRollout"
  ADD CONSTRAINT "RecordEngineRollout_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
