-- Migration 81: Canonicalize ScheduleEntry shift semantics
--
-- Purpose:
--   ScheduleEntry now carries explicit Department ownership (canonical Shift fact).
--   unitId becomes optional (legacy placement, no longer required for new canonical Shifts).
--   roleType becomes nullable (platform authority leakage demoted from required Shift field).
--
-- Backfill:
--   departmentId left NULL for all existing rows. New Shift creation always supplies it.
--   unitId existing rows retain their value unchanged.
--   roleType existing rows retain their value unchanged.
--
-- No prior migrations are modified. Legacy rows remain fully readable.

-- 1. Add departmentId (nullable) with a foreign key to Department
ALTER TABLE "ScheduleEntry"
  ADD COLUMN "departmentId" TEXT;

ALTER TABLE "ScheduleEntry"
  ADD CONSTRAINT "ScheduleEntry_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ScheduleEntry_departmentId_date_idx" ON "ScheduleEntry"("departmentId", "date");

-- 2. Make unitId nullable (existing rows keep their value; new canonical Shifts may omit it)
ALTER TABLE "ScheduleEntry"
  ALTER COLUMN "unitId" DROP NOT NULL;

-- 3. Make roleType nullable (existing rows keep their value; new canonical Shifts do not set it)
ALTER TABLE "ScheduleEntry"
  ALTER COLUMN "roleType" DROP NOT NULL;
