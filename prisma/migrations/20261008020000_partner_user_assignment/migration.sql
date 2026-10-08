-- Phase 2C1: partner role ceiling history and personal partner assignments.
-- Additive only. No backfill. Existing partnerships start with no ceiling and no assignments.

CREATE TYPE "OrganizationPartnerRole" AS ENUM ('PARTNER_VIEWER', 'PARTNER_OPERATOR', 'PARTNER_MANAGER');

CREATE TABLE "FacilityPartnerRoleCeilingPeriod" (
    "id" TEXT NOT NULL,
    "facilityPartnerOrganizationId" TEXT NOT NULL,
    "maxPartnerRole" "OrganizationPartnerRole" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityPartnerRoleCeilingPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerUserFacilityAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facilityPartnerOrganizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerUserFacilityAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerUserRolePeriod" (
    "id" TEXT NOT NULL,
    "partnerUserFacilityAccessId" TEXT NOT NULL,
    "partnerRole" "OrganizationPartnerRole" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerUserRolePeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FacilityPartnerRoleCeiling_partner_startsAt_idx" ON "FacilityPartnerRoleCeilingPeriod"("facilityPartnerOrganizationId", "startsAt");
CREATE INDEX "FacilityPartnerRoleCeiling_partner_endsAt_idx" ON "FacilityPartnerRoleCeilingPeriod"("facilityPartnerOrganizationId", "endsAt");
CREATE INDEX "FacilityPartnerRoleCeilingPeriod_createdByUserId_idx" ON "FacilityPartnerRoleCeilingPeriod"("createdByUserId");
CREATE INDEX "FacilityPartnerRoleCeilingPeriod_endedByUserId_idx" ON "FacilityPartnerRoleCeilingPeriod"("endedByUserId");

CREATE UNIQUE INDEX "PartnerUserFacilityAccess_userId_facilityPartnerOrganizationId_key" ON "PartnerUserFacilityAccess"("userId", "facilityPartnerOrganizationId");
CREATE INDEX "PartnerUserFacilityAccess_facilityPartnerOrganizationId_idx" ON "PartnerUserFacilityAccess"("facilityPartnerOrganizationId");
CREATE INDEX "PartnerUserFacilityAccess_userId_idx" ON "PartnerUserFacilityAccess"("userId");
CREATE INDEX "PartnerUserFacilityAccess_createdByUserId_idx" ON "PartnerUserFacilityAccess"("createdByUserId");

CREATE INDEX "PartnerUserRolePeriod_access_startsAt_idx" ON "PartnerUserRolePeriod"("partnerUserFacilityAccessId", "startsAt");
CREATE INDEX "PartnerUserRolePeriod_access_endsAt_idx" ON "PartnerUserRolePeriod"("partnerUserFacilityAccessId", "endsAt");
CREATE INDEX "PartnerUserRolePeriod_createdByUserId_idx" ON "PartnerUserRolePeriod"("createdByUserId");
CREATE INDEX "PartnerUserRolePeriod_endedByUserId_idx" ON "PartnerUserRolePeriod"("endedByUserId");

ALTER TABLE "FacilityPartnerRoleCeilingPeriod" ADD CONSTRAINT "FacilityPartnerRoleCeilingPeriod_facilityPartnerOrganizationId_fkey" FOREIGN KEY ("facilityPartnerOrganizationId") REFERENCES "FacilityPartnerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacilityPartnerRoleCeilingPeriod" ADD CONSTRAINT "FacilityPartnerRoleCeilingPeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FacilityPartnerRoleCeilingPeriod" ADD CONSTRAINT "FacilityPartnerRoleCeilingPeriod_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerUserFacilityAccess" ADD CONSTRAINT "PartnerUserFacilityAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerUserFacilityAccess" ADD CONSTRAINT "PartnerUserFacilityAccess_facilityPartnerOrganizationId_fkey" FOREIGN KEY ("facilityPartnerOrganizationId") REFERENCES "FacilityPartnerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerUserFacilityAccess" ADD CONSTRAINT "PartnerUserFacilityAccess_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerUserRolePeriod" ADD CONSTRAINT "PartnerUserRolePeriod_partnerUserFacilityAccessId_fkey" FOREIGN KEY ("partnerUserFacilityAccessId") REFERENCES "PartnerUserFacilityAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerUserRolePeriod" ADD CONSTRAINT "PartnerUserRolePeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerUserRolePeriod" ADD CONSTRAINT "PartnerUserRolePeriod_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
