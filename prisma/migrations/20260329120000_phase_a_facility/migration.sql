-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "managementCompanyName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- Single facility for existing rows (seed replaces display name in app seed)
INSERT INTO "Facility" ("id", "displayName", "managementCompanyName", "createdAt", "updatedAt")
VALUES ('cmfacseed0000000000000001', 'Terrace View Long Term Care', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- User
ALTER TABLE "User" ADD COLUMN "facilityId" TEXT;
UPDATE "User" SET "facilityId" = 'cmfacseed0000000000000001';
ALTER TABLE "User" ALTER COLUMN "facilityId" SET NOT NULL;

CREATE INDEX "User_facilityId_idx" ON "User"("facilityId");

ALTER TABLE "User" ADD CONSTRAINT "User_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unit: replace unique name with (facilityId, name)
DROP INDEX IF EXISTS "Unit_name_key";

ALTER TABLE "Unit" ADD COLUMN "facilityId" TEXT;
UPDATE "Unit" SET "facilityId" = 'cmfacseed0000000000000001';
ALTER TABLE "Unit" ALTER COLUMN "facilityId" SET NOT NULL;

CREATE INDEX "Unit_facilityId_idx" ON "Unit"("facilityId");

ALTER TABLE "Unit" ADD CONSTRAINT "Unit_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Unit_facilityId_name_key" ON "Unit"("facilityId", "name");

-- Employee
ALTER TABLE "Employee" ADD COLUMN "facilityId" TEXT;
UPDATE "Employee" SET "facilityId" = 'cmfacseed0000000000000001';
ALTER TABLE "Employee" ALTER COLUMN "facilityId" SET NOT NULL;

CREATE INDEX "Employee_facilityId_idx" ON "Employee"("facilityId");

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- LogTemplate
DROP INDEX IF EXISTS "LogTemplate_name_key";

ALTER TABLE "LogTemplate" ADD COLUMN "facilityId" TEXT;
UPDATE "LogTemplate" SET "facilityId" = 'cmfacseed0000000000000001';
ALTER TABLE "LogTemplate" ALTER COLUMN "facilityId" SET NOT NULL;

CREATE INDEX "LogTemplate_facilityId_idx" ON "LogTemplate"("facilityId");

ALTER TABLE "LogTemplate" ADD CONSTRAINT "LogTemplate_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "LogTemplate_facilityId_name_key" ON "LogTemplate"("facilityId", "name");

-- Vendor
DROP INDEX IF EXISTS "Vendor_name_key";

ALTER TABLE "Vendor" ADD COLUMN "facilityId" TEXT;
UPDATE "Vendor" SET "facilityId" = 'cmfacseed0000000000000001';
ALTER TABLE "Vendor" ALTER COLUMN "facilityId" SET NOT NULL;

CREATE INDEX "Vendor_facilityId_idx" ON "Vendor"("facilityId");

ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Vendor_facilityId_name_key" ON "Vendor"("facilityId", "name");
