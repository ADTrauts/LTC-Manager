-- Existing canonical parent concurrency fence; published definitions and
-- append-only adjustment/actual history remain unchanged.
ALTER TABLE "DepartmentOperationalCycle"
 ADD COLUMN "timingAdjustmentRevision" INTEGER NOT NULL DEFAULT 0;
