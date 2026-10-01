-- Work Plans may target a department-scoped Operational Type.
-- Identity is DepartmentRoomArchetype.key, not display name and not an archetype row id.
-- Additive: existing applicability rows and occurrence rows are unchanged.

ALTER TYPE "DepartmentWorkApplicabilityKind" ADD VALUE IF NOT EXISTS 'OPERATIONAL_TYPE';

ALTER TABLE "DepartmentWorkPlanApplicability"
ADD COLUMN IF NOT EXISTS "operationalTypeKey" TEXT;

CREATE INDEX IF NOT EXISTS "DepartmentWorkPlanApplicability_operationalTypeKey_idx"
ON "DepartmentWorkPlanApplicability"("operationalTypeKey");
