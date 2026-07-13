-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM (
  'HEALTHCARE_SYSTEM',
  'MANAGEMENT_COMPANY',
  'LONG_TERM_CARE',
  'HOSPITAL',
  'K12_DISTRICT',
  'UNIVERSITY',
  'CORPORATE',
  'HOSPITALITY',
  'OTHER'
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "displayName" TEXT,
    "organizationType" "OrganizationType",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organization_name_idx" ON "Organization"("name");
CREATE INDEX "Organization_isActive_idx" ON "Organization"("isActive");

-- AlterTable: nullable during backfill
ALTER TABLE "Facility" ADD COLUMN "organizationId" TEXT;

-- Backfill strategy:
-- 1) Facilities with a non-empty managementCompanyName share one Organization
--    keyed by md5(lower(trim(managementCompanyName))). Display name = trimmed first-seen value.
-- 2) Facilities without managementCompanyName each get "{displayName} Organization".
-- 3) managementCompanyName is preserved unchanged (legacy compatibility).

INSERT INTO "Organization" ("id", "name", "displayName", "organizationType", "isActive", "createdAt", "updatedAt")
SELECT
  'org_' || md5(grouped.key),
  grouped.canonical_name,
  grouped.canonical_name,
  'MANAGEMENT_COMPANY'::"OrganizationType",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT
    lower(trim(f."managementCompanyName")) AS key,
    MIN(trim(f."managementCompanyName")) AS canonical_name
  FROM "Facility" f
  WHERE f."managementCompanyName" IS NOT NULL
    AND trim(f."managementCompanyName") <> ''
  GROUP BY lower(trim(f."managementCompanyName"))
) grouped;

INSERT INTO "Organization" ("id", "name", "displayName", "organizationType", "isActive", "createdAt", "updatedAt")
SELECT
  'org_fac_' || f."id",
  f."displayName" || ' Organization',
  f."displayName" || ' Organization',
  'OTHER'::"OrganizationType",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Facility" f
WHERE f."managementCompanyName" IS NULL
   OR trim(f."managementCompanyName") = '';

UPDATE "Facility" f
SET "organizationId" = 'org_' || md5(lower(trim(f."managementCompanyName")))
WHERE f."managementCompanyName" IS NOT NULL
  AND trim(f."managementCompanyName") <> '';

UPDATE "Facility" f
SET "organizationId" = 'org_fac_' || f."id"
WHERE f."organizationId" IS NULL;

-- Safety: every facility must be linked
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Facility" WHERE "organizationId" IS NULL) THEN
    RAISE EXCEPTION 'Organization backfill left orphaned facilities';
  END IF;
END $$;

ALTER TABLE "Facility" ALTER COLUMN "organizationId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Facility_organizationId_idx" ON "Facility"("organizationId");
