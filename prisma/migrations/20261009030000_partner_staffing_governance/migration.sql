-- Facility-controlled partner staffing delegation and user veto.
-- Does not create current policy periods or restrictions.
-- Existing assignments stay open. Provenance is backfilled as facility_admin,
-- the only assignment writer before this migration.

CREATE TYPE "PartnerAssignmentAuthorityKind" AS ENUM ('facility_admin', 'partner_org_admin');

ALTER TABLE "PartnerUserRolePeriod"
  ADD COLUMN "createdByAuthorityKind" "PartnerAssignmentAuthorityKind",
  ADD COLUMN "createdByOrganizationId" TEXT,
  ADD COLUMN "endedByAuthorityKind" "PartnerAssignmentAuthorityKind",
  ADD COLUMN "endedByOrganizationId" TEXT;

UPDATE "PartnerUserRolePeriod"
SET
  "createdByAuthorityKind" = 'facility_admin',
  "createdByOrganizationId" = NULL;

UPDATE "PartnerUserRolePeriod"
SET
  "endedByAuthorityKind" = 'facility_admin',
  "endedByOrganizationId" = NULL
WHERE "endsAt" IS NOT NULL;

ALTER TABLE "PartnerUserRolePeriod"
  ALTER COLUMN "createdByAuthorityKind" SET NOT NULL;

ALTER TABLE "PartnerUserRolePeriod"
  ADD CONSTRAINT "PartnerUserRolePeriod_created_authority_ck"
  CHECK (
    (
      "createdByAuthorityKind" = 'facility_admin'
      AND "createdByOrganizationId" IS NULL
    )
    OR (
      "createdByAuthorityKind" = 'partner_org_admin'
      AND "createdByOrganizationId" IS NOT NULL
    )
  );

ALTER TABLE "PartnerUserRolePeriod"
  ADD CONSTRAINT "PartnerUserRolePeriod_ended_authority_ck"
  CHECK (
    (
      "endsAt" IS NULL
      AND "endedByAuthorityKind" IS NULL
      AND "endedByOrganizationId" IS NULL
    )
    OR (
      "endsAt" IS NOT NULL
      AND "endedByAuthorityKind" = 'facility_admin'
      AND "endedByOrganizationId" IS NULL
    )
    OR (
      "endsAt" IS NOT NULL
      AND "endedByAuthorityKind" = 'partner_org_admin'
      AND "endedByOrganizationId" IS NOT NULL
    )
  );

CREATE TABLE "FacilityPartnerStaffingPolicyPeriod" (
  "id" TEXT NOT NULL,
  "facilityPartnerOrganizationId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "endedByUserId" TEXT,
  "createdByAuthorityKind" "PartnerAssignmentAuthorityKind" NOT NULL,
  "createdByOrganizationId" TEXT,
  "endedByAuthorityKind" "PartnerAssignmentAuthorityKind",
  "endedByOrganizationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacilityPartnerStaffingPolicyPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FacilityPartnerStaffingPolicyPeriod_partner_startsAt_idx"
  ON "FacilityPartnerStaffingPolicyPeriod"("facilityPartnerOrganizationId", "startsAt");
CREATE INDEX "FacilityPartnerStaffingPolicyPeriod_partner_endsAt_idx"
  ON "FacilityPartnerStaffingPolicyPeriod"("facilityPartnerOrganizationId", "endsAt");
CREATE INDEX "FacilityPartnerStaffingPolicyPeriod_createdByUserId_idx"
  ON "FacilityPartnerStaffingPolicyPeriod"("createdByUserId");
CREATE INDEX "FacilityPartnerStaffingPolicyPeriod_endedByUserId_idx"
  ON "FacilityPartnerStaffingPolicyPeriod"("endedByUserId");

ALTER TABLE "FacilityPartnerStaffingPolicyPeriod"
  ADD CONSTRAINT "FacilityPartnerStaffingPolicyPeriod_facilityPartnerOrganizationId_fkey"
  FOREIGN KEY ("facilityPartnerOrganizationId") REFERENCES "FacilityPartnerOrganization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacilityPartnerStaffingPolicyPeriod"
  ADD CONSTRAINT "FacilityPartnerStaffingPolicyPeriod_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FacilityPartnerStaffingPolicyPeriod"
  ADD CONSTRAINT "FacilityPartnerStaffingPolicyPeriod_endedByUserId_fkey"
  FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FacilityPartnerUserRestrictionPeriod" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "facilityPartnerOrganizationId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "note" TEXT,
  "createdByUserId" TEXT,
  "endedByUserId" TEXT,
  "createdByAuthorityKind" "PartnerAssignmentAuthorityKind" NOT NULL,
  "createdByOrganizationId" TEXT,
  "endedByAuthorityKind" "PartnerAssignmentAuthorityKind",
  "endedByOrganizationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacilityPartnerUserRestrictionPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FacilityPartnerUserRestrictionPeriod_partner_user_startsAt_idx"
  ON "FacilityPartnerUserRestrictionPeriod"("facilityPartnerOrganizationId", "userId", "startsAt");
CREATE INDEX "FacilityPartnerUserRestrictionPeriod_partner_user_endsAt_idx"
  ON "FacilityPartnerUserRestrictionPeriod"("facilityPartnerOrganizationId", "userId", "endsAt");
CREATE INDEX "FacilityPartnerUserRestrictionPeriod_userId_idx"
  ON "FacilityPartnerUserRestrictionPeriod"("userId");
CREATE INDEX "FacilityPartnerUserRestrictionPeriod_createdByUserId_idx"
  ON "FacilityPartnerUserRestrictionPeriod"("createdByUserId");
CREATE INDEX "FacilityPartnerUserRestrictionPeriod_endedByUserId_idx"
  ON "FacilityPartnerUserRestrictionPeriod"("endedByUserId");

ALTER TABLE "FacilityPartnerUserRestrictionPeriod"
  ADD CONSTRAINT "FacilityPartnerUserRestrictionPeriod_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilityPartnerUserRestrictionPeriod"
  ADD CONSTRAINT "FacilityPartnerUserRestrictionPeriod_facilityPartnerOrganizationId_fkey"
  FOREIGN KEY ("facilityPartnerOrganizationId") REFERENCES "FacilityPartnerOrganization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacilityPartnerUserRestrictionPeriod"
  ADD CONSTRAINT "FacilityPartnerUserRestrictionPeriod_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FacilityPartnerUserRestrictionPeriod"
  ADD CONSTRAINT "FacilityPartnerUserRestrictionPeriod_endedByUserId_fkey"
  FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
