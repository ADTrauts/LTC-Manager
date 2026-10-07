-- DepartmentOperatorRelationship: date-effective operating Organization for a Department.
-- Governance metadata only. Does not grant facility authorization.
-- Backfill: every existing Department gets an explicit self-operated row as of migration date.
-- effectiveFrom = CURRENT_DATE represents current state only — not historical contract truth.

CREATE TABLE "DepartmentOperatorRelationship" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "notes" TEXT,
    "externalAccountCode" TEXT,
    "contractReference" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentOperatorRelationship_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DepartmentOperatorRelationship_departmentId_effectiveFrom_idx" ON "DepartmentOperatorRelationship"("departmentId", "effectiveFrom");

CREATE INDEX "DepartmentOperatorRelationship_departmentId_effectiveTo_idx" ON "DepartmentOperatorRelationship"("departmentId", "effectiveTo");

CREATE INDEX "DepartmentOperatorRelationship_organizationId_idx" ON "DepartmentOperatorRelationship"("organizationId");

CREATE INDEX "DepartmentOperatorRelationship_createdByUserId_idx" ON "DepartmentOperatorRelationship"("createdByUserId");

ALTER TABLE "DepartmentOperatorRelationship" ADD CONSTRAINT "DepartmentOperatorRelationship_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentOperatorRelationship" ADD CONSTRAINT "DepartmentOperatorRelationship_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DepartmentOperatorRelationship" ADD CONSTRAINT "DepartmentOperatorRelationship_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Explicit self-operation for every Department that has none yet.
-- organizationId = Facility parent Organization. effectiveFrom = migration calendar day.
INSERT INTO "DepartmentOperatorRelationship" (
  "id",
  "departmentId",
  "organizationId",
  "effectiveFrom",
  "effectiveTo",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  d."id",
  f."organizationId",
  CURRENT_DATE,
  NULL,
  'Backfilled as facility-operated current state at DepartmentOperatorRelationship migration. Not historical contract truth.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Department" d
INNER JOIN "Facility" f ON f."id" = d."facilityId"
WHERE NOT EXISTS (
  SELECT 1
  FROM "DepartmentOperatorRelationship" r
  WHERE r."departmentId" = d."id"
);
