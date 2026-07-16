-- Explicit Facility Builder hierarchy role (additive, nullable for existing rows).
CREATE TYPE "UnitHierarchyRole" AS ENUM ('FLOOR', 'NEIGHBORHOOD', 'LEGACY_LOCATION');

ALTER TABLE "Unit" ADD COLUMN "hierarchyRole" "UnitHierarchyRole";

CREATE INDEX "Unit_hierarchyRole_idx" ON "Unit"("hierarchyRole");
