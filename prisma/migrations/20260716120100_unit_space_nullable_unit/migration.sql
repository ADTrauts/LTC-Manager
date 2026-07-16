-- Stage 2D continued: nullable UnitSpace.unitId + partial uniques

ALTER TABLE "UnitSpace" DROP CONSTRAINT IF EXISTS "UnitSpace_unitId_fkey";
DROP INDEX IF EXISTS "UnitSpace_unitId_name_key";
ALTER TABLE "UnitSpace" DROP CONSTRAINT IF EXISTS "UnitSpace_unitId_name_key";
ALTER TABLE "UnitSpace" ALTER COLUMN "unitId" DROP NOT NULL;

ALTER TABLE "UnitSpace"
  ADD CONSTRAINT "UnitSpace_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "UnitSpace_unitId_name_assigned_key"
  ON "UnitSpace" ("unitId", "name")
  WHERE "unitId" IS NOT NULL;

CREATE UNIQUE INDEX "UnitSpace_facilityId_name_undesignated_key"
  ON "UnitSpace" ("facilityId", "name")
  WHERE "unitId" IS NULL;
