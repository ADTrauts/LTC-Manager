-- Retire Assignment zones (approved by the product owner November 23, 2026).
-- Forward-only. Removes the zone objects created by 20261111120000_canonical_baseline.
-- OperationalAssignmentLocation keeps each Assignment's snapshotted rooms, so no responsibility is lost.
-- UnitType.EVS_ZONE is a Facility place type and is not affected.

ALTER TABLE "OperationalAssignment" DROP CONSTRAINT IF EXISTS "OperationalAssignment_sourceZoneId_fkey";
DROP INDEX IF EXISTS "OperationalAssignment_sourceZoneId_idx";
ALTER TABLE "OperationalAssignment" DROP COLUMN IF EXISTS "sourceZoneId";

DROP TABLE IF EXISTS "DepartmentOperationalZoneLocation";
DROP TABLE IF EXISTS "DepartmentOperationalZone";

DROP TYPE IF EXISTS "DepartmentOperationalZoneStatus";
