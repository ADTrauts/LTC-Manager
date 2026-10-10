-- Phase 2E1: internal Facility RoleKey history on UserFacilityAccess.
-- User.roleId remains compatibility/home default only. No PIN / Employee / partner / org changes.

CREATE TABLE "UserFacilityRolePeriod" (
    "id" TEXT NOT NULL,
    "userFacilityAccessId" TEXT NOT NULL,
    "roleKey" "RoleKey" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFacilityRolePeriod_pkey" PRIMARY KEY ("id")
);

-- Home Facility must resolve through the same grant layer as additional Facilities.
INSERT INTO "UserFacilityAccess" (
    "id",
    "userId",
    "facilityId",
    "isActive",
    "grantedByUserId",
    "grantedAt",
    "revokedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'ufa_home_' || u."id",
    u."id",
    u."facilityId",
    true,
    NULL,
    CURRENT_TIMESTAMP,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User" u
WHERE u."facilityId" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM "UserFacilityAccess" a
      WHERE a."userId" = u."id"
        AND a."facilityId" = u."facilityId"
  );

-- Backfill current RoleKey from User.roleId onto every active internal grant.
-- Multi-Facility Users keep the same RoleKey at every grant until an admin diverges them.
INSERT INTO "UserFacilityRolePeriod" (
    "id",
    "userFacilityAccessId",
    "roleKey",
    "startsAt",
    "endsAt",
    "createdByUserId",
    "endedByUserId",
    "createdAt",
    "updatedAt"
)
SELECT
    'ufrp_' || a."id",
    a."id",
    r."key",
    a."grantedAt",
    NULL,
    NULL,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "UserFacilityAccess" a
JOIN "User" u ON u."id" = a."userId"
JOIN "Role" r ON r."id" = u."roleId"
WHERE a."isActive" = true
  AND a."revokedAt" IS NULL
  AND u."roleId" IS NOT NULL;

CREATE INDEX "UserFacilityRolePeriod_access_startsAt_idx"
    ON "UserFacilityRolePeriod"("userFacilityAccessId", "startsAt");

CREATE INDEX "UserFacilityRolePeriod_access_endsAt_idx"
    ON "UserFacilityRolePeriod"("userFacilityAccessId", "endsAt");

CREATE INDEX "UserFacilityRolePeriod_createdByUserId_idx"
    ON "UserFacilityRolePeriod"("createdByUserId");

CREATE INDEX "UserFacilityRolePeriod_endedByUserId_idx"
    ON "UserFacilityRolePeriod"("endedByUserId");

CREATE UNIQUE INDEX "UserFacilityRolePeriod_access_current_uidx"
    ON "UserFacilityRolePeriod"("userFacilityAccessId")
    WHERE "endsAt" IS NULL;

ALTER TABLE "UserFacilityRolePeriod" ADD CONSTRAINT "UserFacilityRolePeriod_userFacilityAccessId_fkey"
    FOREIGN KEY ("userFacilityAccessId") REFERENCES "UserFacilityAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserFacilityRolePeriod" ADD CONSTRAINT "UserFacilityRolePeriod_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserFacilityRolePeriod" ADD CONSTRAINT "UserFacilityRolePeriod_endedByUserId_fkey"
    FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "UserFacilityAccess" a
    JOIN "User" u ON u."id" = a."userId"
    LEFT JOIN "UserFacilityRolePeriod" p
      ON p."userFacilityAccessId" = a."id"
     AND p."endsAt" IS NULL
    WHERE a."isActive" = true
      AND a."revokedAt" IS NULL
      AND u."roleId" IS NOT NULL
      AND p."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'UserFacilityRolePeriod backfill left an active grant without a current role period';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "UserFacilityRolePeriod" p
    JOIN "UserFacilityAccess" a ON a."id" = p."userFacilityAccessId"
    JOIN "User" u ON u."id" = a."userId"
    WHERE a."isActive" = false
      AND p."endsAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'UserFacilityRolePeriod backfill opened a current role on an inactive grant';
  END IF;
END $$;
