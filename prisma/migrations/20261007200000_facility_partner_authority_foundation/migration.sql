-- Phase 2A: Facility partner governance foundation.
-- Additive only. No backfill from operators, legacy management company, FacilityOrganization, or Vendor.
-- Does not grant any user Facility access.

CREATE TABLE "FacilityPartnerOrganization" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "endedByUserId" TEXT,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityPartnerOrganization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FacilityPartnerAccessPeriod" (
    "id" TEXT NOT NULL,
    "facilityPartnerOrganizationId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityPartnerAccessPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FacilityPartnerDepartmentScope" (
    "id" TEXT NOT NULL,
    "facilityPartnerOrganizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityPartnerDepartmentScope_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacilityPartnerOrganization_facilityId_organizationId_key" ON "FacilityPartnerOrganization"("facilityId", "organizationId");

CREATE INDEX "FacilityPartnerOrganization_facilityId_idx" ON "FacilityPartnerOrganization"("facilityId");

CREATE INDEX "FacilityPartnerOrganization_organizationId_idx" ON "FacilityPartnerOrganization"("organizationId");

CREATE INDEX "FacilityPartnerOrganization_endedAt_idx" ON "FacilityPartnerOrganization"("endedAt");

CREATE INDEX "FacilityPartnerAccessPeriod_partner_startsAt_idx" ON "FacilityPartnerAccessPeriod"("facilityPartnerOrganizationId", "startsAt");

CREATE INDEX "FacilityPartnerAccessPeriod_partner_endsAt_idx" ON "FacilityPartnerAccessPeriod"("facilityPartnerOrganizationId", "endsAt");

CREATE INDEX "FacilityPartnerDeptScope_partner_startsAt_idx" ON "FacilityPartnerDepartmentScope"("facilityPartnerOrganizationId", "startsAt");

CREATE INDEX "FacilityPartnerDeptScope_partner_dept_startsAt_idx" ON "FacilityPartnerDepartmentScope"("facilityPartnerOrganizationId", "departmentId", "startsAt");

CREATE INDEX "FacilityPartnerDeptScope_departmentId_idx" ON "FacilityPartnerDepartmentScope"("departmentId");

ALTER TABLE "FacilityPartnerOrganization" ADD CONSTRAINT "FacilityPartnerOrganization_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FacilityPartnerOrganization" ADD CONSTRAINT "FacilityPartnerOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FacilityPartnerOrganization" ADD CONSTRAINT "FacilityPartnerOrganization_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FacilityPartnerOrganization" ADD CONSTRAINT "FacilityPartnerOrganization_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FacilityPartnerOrganization" ADD CONSTRAINT "FacilityPartnerOrganization_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FacilityPartnerAccessPeriod" ADD CONSTRAINT "FacilityPartnerAccessPeriod_facilityPartnerOrganizationId_fkey" FOREIGN KEY ("facilityPartnerOrganizationId") REFERENCES "FacilityPartnerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FacilityPartnerAccessPeriod" ADD CONSTRAINT "FacilityPartnerAccessPeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FacilityPartnerAccessPeriod" ADD CONSTRAINT "FacilityPartnerAccessPeriod_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FacilityPartnerDepartmentScope" ADD CONSTRAINT "FacilityPartnerDepartmentScope_facilityPartnerOrganizationId_fkey" FOREIGN KEY ("facilityPartnerOrganizationId") REFERENCES "FacilityPartnerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FacilityPartnerDepartmentScope" ADD CONSTRAINT "FacilityPartnerDepartmentScope_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FacilityPartnerDepartmentScope" ADD CONSTRAINT "FacilityPartnerDepartmentScope_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FacilityPartnerDepartmentScope" ADD CONSTRAINT "FacilityPartnerDepartmentScope_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
