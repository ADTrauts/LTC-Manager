-- Stage 2D: Undesignated staging
-- STAGED hierarchy role for builder-only neighborhoods
-- Nullable UnitSpace.unitId for undesignated rooms

ALTER TYPE "UnitHierarchyRole" ADD VALUE 'STAGED';
