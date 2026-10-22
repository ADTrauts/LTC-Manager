-- CDA-06: stamp Department rows with the vendor operator period in force when they were created.
-- Null means the facility's own period. Test data only. No customer migration.

ALTER TABLE "OperationalEvidenceRecord" ADD COLUMN "operatorPeriodId" TEXT;
ALTER TABLE "Menu" ADD COLUMN "operatorPeriodId" TEXT;
ALTER TABLE "DepartmentWorkPlan" ADD COLUMN "operatorPeriodId" TEXT;
ALTER TABLE "DepartmentOperationalCycle" ADD COLUMN "operatorPeriodId" TEXT;
ALTER TABLE "Employee" ADD COLUMN "operatorPeriodId" TEXT;
ALTER TABLE "ScheduleEntry" ADD COLUMN "operatorPeriodId" TEXT;
ALTER TABLE "CatalogLogDefinition" ADD COLUMN "operatorPeriodId" TEXT;

CREATE INDEX "OperationalEvidenceRecord_departmentId_operatorPeriodId_idx" ON "OperationalEvidenceRecord"("departmentId", "operatorPeriodId");
CREATE INDEX "Menu_departmentId_operatorPeriodId_idx" ON "Menu"("departmentId", "operatorPeriodId");
CREATE INDEX "DepartmentWorkPlan_departmentId_operatorPeriodId_idx" ON "DepartmentWorkPlan"("departmentId", "operatorPeriodId");
CREATE INDEX "DepartmentOperationalCycle_departmentId_operatorPeriodId_idx" ON "DepartmentOperationalCycle"("departmentId", "operatorPeriodId");
CREATE INDEX "Employee_operatorPeriodId_idx" ON "Employee"("operatorPeriodId");
CREATE INDEX "ScheduleEntry_departmentId_operatorPeriodId_idx" ON "ScheduleEntry"("departmentId", "operatorPeriodId");
CREATE INDEX "CatalogLogDefinition_operatorPeriodId_idx" ON "CatalogLogDefinition"("operatorPeriodId");

ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepartmentWorkPlan" ADD CONSTRAINT "DepartmentWorkPlan_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepartmentOperationalCycle" ADD CONSTRAINT "DepartmentOperationalCycle_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CatalogLogDefinition" ADD CONSTRAINT "CatalogLogDefinition_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill from createdAt. A facility-operated relationship is left null.
UPDATE "OperationalEvidenceRecord" AS row
SET "operatorPeriodId" = picked.id
FROM (
  SELECT DISTINCT ON (target.id) target.id AS row_id, period.id
  FROM "OperationalEvidenceRecord" AS target
  JOIN "Department" AS department ON department.id = target."departmentId"
  JOIN "Facility" AS facility ON facility.id = department."facilityId"
  JOIN "DepartmentOperatorRelationship" AS period ON period."departmentId" = target."departmentId"
  WHERE period."organizationId" <> facility."organizationId"
    AND (target."createdAt" AT TIME ZONE facility.timezone)::date >= period."effectiveFrom"
    AND (period."effectiveTo" IS NULL OR (target."createdAt" AT TIME ZONE facility.timezone)::date <= period."effectiveTo")
  ORDER BY target.id, period."effectiveFrom" DESC
) AS picked
WHERE row.id = picked.row_id;

UPDATE "Menu" AS row
SET "operatorPeriodId" = picked.id
FROM (
  SELECT DISTINCT ON (target.id) target.id AS row_id, period.id
  FROM "Menu" AS target
  JOIN "Department" AS department ON department.id = target."departmentId"
  JOIN "Facility" AS facility ON facility.id = department."facilityId"
  JOIN "DepartmentOperatorRelationship" AS period ON period."departmentId" = target."departmentId"
  WHERE period."organizationId" <> facility."organizationId"
    AND (target."createdAt" AT TIME ZONE facility.timezone)::date >= period."effectiveFrom"
    AND (period."effectiveTo" IS NULL OR (target."createdAt" AT TIME ZONE facility.timezone)::date <= period."effectiveTo")
  ORDER BY target.id, period."effectiveFrom" DESC
) AS picked
WHERE row.id = picked.row_id;

UPDATE "DepartmentWorkPlan" AS row
SET "operatorPeriodId" = picked.id
FROM (
  SELECT DISTINCT ON (target.id) target.id AS row_id, period.id
  FROM "DepartmentWorkPlan" AS target
  JOIN "Department" AS department ON department.id = target."departmentId"
  JOIN "Facility" AS facility ON facility.id = department."facilityId"
  JOIN "DepartmentOperatorRelationship" AS period ON period."departmentId" = target."departmentId"
  WHERE period."organizationId" <> facility."organizationId"
    AND (target."createdAt" AT TIME ZONE facility.timezone)::date >= period."effectiveFrom"
    AND (period."effectiveTo" IS NULL OR (target."createdAt" AT TIME ZONE facility.timezone)::date <= period."effectiveTo")
  ORDER BY target.id, period."effectiveFrom" DESC
) AS picked
WHERE row.id = picked.row_id;

UPDATE "DepartmentOperationalCycle" AS row
SET "operatorPeriodId" = picked.id
FROM (
  SELECT DISTINCT ON (target.id) target.id AS row_id, period.id
  FROM "DepartmentOperationalCycle" AS target
  JOIN "Department" AS department ON department.id = target."departmentId"
  JOIN "Facility" AS facility ON facility.id = department."facilityId"
  JOIN "DepartmentOperatorRelationship" AS period ON period."departmentId" = target."departmentId"
  WHERE period."organizationId" <> facility."organizationId"
    AND (target."createdAt" AT TIME ZONE facility.timezone)::date >= period."effectiveFrom"
    AND (period."effectiveTo" IS NULL OR (target."createdAt" AT TIME ZONE facility.timezone)::date <= period."effectiveTo")
  ORDER BY target.id, period."effectiveFrom" DESC
) AS picked
WHERE row.id = picked.row_id;

UPDATE "Employee" AS row
SET "operatorPeriodId" = picked.id
FROM (
  SELECT DISTINCT ON (target.id) target.id AS row_id, period.id
  FROM "Employee" AS target
  JOIN "Department" AS department ON department.id = target."primaryDepartmentId"
  JOIN "Facility" AS facility ON facility.id = department."facilityId"
  JOIN "DepartmentOperatorRelationship" AS period ON period."departmentId" = target."primaryDepartmentId"
  WHERE target."primaryDepartmentId" IS NOT NULL
    AND period."organizationId" <> facility."organizationId"
    AND (target."createdAt" AT TIME ZONE facility.timezone)::date >= period."effectiveFrom"
    AND (period."effectiveTo" IS NULL OR (target."createdAt" AT TIME ZONE facility.timezone)::date <= period."effectiveTo")
  ORDER BY target.id, period."effectiveFrom" DESC
) AS picked
WHERE row.id = picked.row_id;

UPDATE "ScheduleEntry" AS row
SET "operatorPeriodId" = picked.id
FROM (
  SELECT DISTINCT ON (target.id) target.id AS row_id, period.id
  FROM "ScheduleEntry" AS target
  JOIN "Department" AS department ON department.id = target."departmentId"
  JOIN "Facility" AS facility ON facility.id = department."facilityId"
  JOIN "DepartmentOperatorRelationship" AS period ON period."departmentId" = target."departmentId"
  WHERE target."departmentId" IS NOT NULL
    AND period."organizationId" <> facility."organizationId"
    AND (target."createdAt" AT TIME ZONE facility.timezone)::date >= period."effectiveFrom"
    AND (period."effectiveTo" IS NULL OR (target."createdAt" AT TIME ZONE facility.timezone)::date <= period."effectiveTo")
  ORDER BY target.id, period."effectiveFrom" DESC
) AS picked
WHERE row.id = picked.row_id;

UPDATE "CatalogLogDefinition" AS row
SET "operatorPeriodId" = picked.id
FROM (
  SELECT DISTINCT ON (target.id) target.id AS row_id, period.id
  FROM "CatalogLogDefinition" AS target
  JOIN "DepartmentOperatorRelationship" AS period ON period."organizationId" = target."ownerOrganizationId"
  JOIN "Department" AS department ON department.id = period."departmentId"
  JOIN "Facility" AS facility ON facility.id = department."facilityId"
  WHERE target."ownerKind" = 'ORGANIZATION'
    AND target."ownerOrganizationId" IS NOT NULL
    AND period."organizationId" <> facility."organizationId"
    AND (target."createdAt" AT TIME ZONE facility.timezone)::date >= period."effectiveFrom"
    AND (period."effectiveTo" IS NULL OR (target."createdAt" AT TIME ZONE facility.timezone)::date <= period."effectiveTo")
  ORDER BY target.id, period."effectiveFrom" DESC
) AS picked
WHERE row.id = picked.row_id;
