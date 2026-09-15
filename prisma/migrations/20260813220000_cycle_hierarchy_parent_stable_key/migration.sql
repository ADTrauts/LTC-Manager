-- Additive hierarchy: child versions reference the parent's logical stableKey.
-- Existing rows remain top-level (NULL). No label-based reparenting.

ALTER TABLE "DepartmentOperationalCycle"
  ADD COLUMN "parentStableKey" TEXT;

CREATE INDEX "DepartmentOperationalCycle_departmentId_parentStableKey_idx"
  ON "DepartmentOperationalCycle"("departmentId", "parentStableKey");
