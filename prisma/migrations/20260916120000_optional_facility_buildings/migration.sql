-- Optional Building hierarchy role, custom Building vocabulary, and
-- sibling-scoped Unit name uniqueness (same Floor name in two buildings).

ALTER TYPE "UnitHierarchyRole" ADD VALUE 'BUILDING';

ALTER TABLE "Facility" ADD COLUMN "vocabularyLevel0Label" TEXT;

DROP INDEX "Unit_facilityId_name_key";

CREATE UNIQUE INDEX "Unit_facility_root_name_key"
  ON "Unit"("facilityId", "name")
  WHERE "parentUnitId" IS NULL;

CREATE UNIQUE INDEX "Unit_facility_parent_name_key"
  ON "Unit"("facilityId", "parentUnitId", "name")
  WHERE "parentUnitId" IS NOT NULL;
