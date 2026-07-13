-- Explicit multi-facility access grants (Wave 11 M2).
-- Shared Organization membership alone never authorizes a facility.

CREATE TABLE "UserFacilityAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "grantedByUserId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFacilityAccess_pkey" PRIMARY KEY ("id")
);

-- Backfill: every existing user receives access to their current facility.
INSERT INTO "UserFacilityAccess" ("id", "userId", "facilityId", "isActive", "grantedByUserId", "grantedAt", "revokedAt", "createdAt", "updatedAt")
SELECT
  'ufa_' || u."id",
  u."id",
  u."facilityId",
  true,
  NULL,
  CURRENT_TIMESTAMP,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u;

-- Safety: no user left without a grant for their current facility
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User" u
    LEFT JOIN "UserFacilityAccess" a
      ON a."userId" = u."id"
     AND a."facilityId" = u."facilityId"
     AND a."isActive" = true
    WHERE a."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'UserFacilityAccess backfill left orphaned users without current-facility access';
  END IF;
END $$;

CREATE UNIQUE INDEX "UserFacilityAccess_userId_facilityId_key" ON "UserFacilityAccess"("userId", "facilityId");
CREATE INDEX "UserFacilityAccess_userId_isActive_idx" ON "UserFacilityAccess"("userId", "isActive");
CREATE INDEX "UserFacilityAccess_facilityId_isActive_idx" ON "UserFacilityAccess"("facilityId", "isActive");
CREATE INDEX "UserFacilityAccess_grantedByUserId_idx" ON "UserFacilityAccess"("grantedByUserId");

ALTER TABLE "UserFacilityAccess" ADD CONSTRAINT "UserFacilityAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserFacilityAccess" ADD CONSTRAINT "UserFacilityAccess_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserFacilityAccess" ADD CONSTRAINT "UserFacilityAccess_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
