-- CDA-02: one Facility Administrator per facility, moved only by an accepted invitation.

-- Refuse to apply while any facility already has more than one. Runs before any DDL.
-- Resolve with: npx tsx scripts/facility-administrator-report.ts
DO $$
BEGIN
  IF EXISTS (
    SELECT a."facilityId"
    FROM "UserFacilityRolePeriod" p
    JOIN "UserFacilityAccess" a ON a."id" = p."userFacilityAccessId"
    WHERE p."roleKey" = 'FACILITY_ADMINISTRATOR' AND p."endsAt" IS NULL
    GROUP BY a."facilityId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'CDA-02: a facility has more than one Facility Administrator. Run scripts/facility-administrator-report.ts and resolve each one before applying this migration.';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "FacilityAdministratorInvitationKind" AS ENUM ('TRANSFER', 'RECOVERY');

-- CreateEnum
CREATE TYPE "FacilityAdministratorInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "FacilityAdministratorInvitation" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "kind" "FacilityAdministratorInvitationKind" NOT NULL,
    "status" "FacilityAdministratorInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedUserId" TEXT NOT NULL,
    "invitedByUserId" TEXT,
    "outgoingUserId" TEXT,
    "outgoingRoleKey" "RoleKey",
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityAdministratorInvitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FacilityAdministratorInvitation_outgoing_role_check" CHECK (
        ("kind" = 'TRANSFER') = ("outgoingRoleKey" IS NOT NULL)
        AND ("outgoingRoleKey" IS NULL OR "outgoingRoleKey" <> 'FACILITY_ADMINISTRATOR')
    ),
    CONSTRAINT "FacilityAdministratorInvitation_closed_check" CHECK (("status" = 'PENDING') = ("closedAt" IS NULL))
);

-- CreateIndex
CREATE INDEX "FacilityAdministratorInvitation_facilityId_status_idx" ON "FacilityAdministratorInvitation"("facilityId", "status");

-- CreateIndex
CREATE INDEX "FacilityAdministratorInvitation_invitedUserId_status_idx" ON "FacilityAdministratorInvitation"("invitedUserId", "status");

-- CreateIndex
CREATE INDEX "FacilityAdministratorInvitation_invitedByUserId_idx" ON "FacilityAdministratorInvitation"("invitedByUserId");

-- CreateIndex
CREATE INDEX "FacilityAdministratorInvitation_outgoingUserId_idx" ON "FacilityAdministratorInvitation"("outgoingUserId");

-- CreateIndex
CREATE INDEX "FacilityAdministratorInvitation_closedByUserId_idx" ON "FacilityAdministratorInvitation"("closedByUserId");

-- One open invitation per facility.
CREATE UNIQUE INDEX "FacilityAdministratorInvitation_one_pending_uidx"
    ON "FacilityAdministratorInvitation"("facilityId")
    WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "FacilityAdministratorInvitation" ADD CONSTRAINT "FacilityAdministratorInvitation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityAdministratorInvitation" ADD CONSTRAINT "FacilityAdministratorInvitation_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityAdministratorInvitation" ADD CONSTRAINT "FacilityAdministratorInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityAdministratorInvitation" ADD CONSTRAINT "FacilityAdministratorInvitation_outgoingUserId_fkey" FOREIGN KEY ("outgoingUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityAdministratorInvitation" ADD CONSTRAINT "FacilityAdministratorInvitation_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one open FACILITY_ADMINISTRATOR role period per facility. The Facility row lock
-- serializes concurrent writers; each statement below takes a fresh snapshot after the lock.
CREATE FUNCTION "facility_single_administrator"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_facility TEXT;
BEGIN
  IF NEW."roleKey" <> 'FACILITY_ADMINISTRATOR' OR NEW."endsAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT "facilityId" INTO target_facility FROM "UserFacilityAccess" WHERE "id" = NEW."userFacilityAccessId";
  PERFORM 1 FROM "Facility" WHERE "id" = target_facility FOR UPDATE;
  IF EXISTS (
    SELECT 1
    FROM "UserFacilityRolePeriod" p
    JOIN "UserFacilityAccess" a ON a."id" = p."userFacilityAccessId"
    WHERE a."facilityId" = target_facility
      AND p."roleKey" = 'FACILITY_ADMINISTRATOR'
      AND p."endsAt" IS NULL
      AND p."id" <> NEW."id"
  ) THEN
    RAISE EXCEPTION 'Facility % already has a Facility Administrator', target_facility
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'UserFacilityRolePeriod_one_facility_administrator';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "UserFacilityRolePeriod_one_facility_administrator"
  BEFORE INSERT OR UPDATE OF "roleKey", "endsAt", "userFacilityAccessId" ON "UserFacilityRolePeriod"
  FOR EACH ROW EXECUTE FUNCTION "facility_single_administrator"();
