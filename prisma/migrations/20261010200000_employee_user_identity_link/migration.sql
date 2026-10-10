-- Phase 2E2: explicit User ↔ Employee identity link.
-- PIN / Employee credentials / partner / org memberships are unchanged.

ALTER TABLE "Employee" ADD COLUMN "userId" TEXT;

-- SAFE AUTO-LINK only: unique Employee email at Facility F, unique User email,
-- and User has home Facility F or an active internal grant at F.
-- Ambiguous / unmatched / cross-context emails stay null.
UPDATE "Employee" e
SET "userId" = matched."userId"
FROM (
  SELECT
    e2."id" AS "employeeId",
    u."id" AS "userId"
  FROM "Employee" e2
  JOIN "User" u
    ON lower(trim(u."email")) = lower(trim(e2."email"))
  WHERE e2."email" IS NOT NULL
    AND trim(e2."email") <> ''
    AND (
      u."facilityId" = e2."facilityId"
      OR EXISTS (
        SELECT 1
        FROM "UserFacilityAccess" a
        WHERE a."userId" = u."id"
          AND a."facilityId" = e2."facilityId"
          AND a."isActive" = true
          AND a."revokedAt" IS NULL
      )
    )
    AND (
      SELECT COUNT(*)
      FROM "Employee" e3
      WHERE e3."facilityId" = e2."facilityId"
        AND e3."email" IS NOT NULL
        AND trim(e3."email") <> ''
        AND lower(trim(e3."email")) = lower(trim(e2."email"))
    ) = 1
) matched
WHERE e."id" = matched."employeeId";

CREATE INDEX "Employee_userId_idx" ON "Employee"("userId");

CREATE UNIQUE INDEX "Employee_facilityId_userId_key"
  ON "Employee"("facilityId", "userId");

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "EmployeeUserLinkInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

CREATE TABLE "EmployeeUserLinkInvitation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "targetEmailNormalized" TEXT NOT NULL,
    "intendedRoleKey" "RoleKey" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "EmployeeUserLinkInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeUserLinkInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeUserLinkInvitation_tokenHash_key"
  ON "EmployeeUserLinkInvitation"("tokenHash");

CREATE INDEX "EmployeeUserLinkInvitation_employeeId_status_idx"
  ON "EmployeeUserLinkInvitation"("employeeId", "status");

CREATE INDEX "EmployeeUserLinkInvitation_facilityId_status_idx"
  ON "EmployeeUserLinkInvitation"("facilityId", "status");

CREATE INDEX "EmployeeUserLinkInvitation_targetEmailNormalized_status_idx"
  ON "EmployeeUserLinkInvitation"("targetEmailNormalized", "status");

CREATE INDEX "EmployeeUserLinkInvitation_status_expiresAt_idx"
  ON "EmployeeUserLinkInvitation"("status", "expiresAt");

ALTER TABLE "EmployeeUserLinkInvitation"
  ADD CONSTRAINT "EmployeeUserLinkInvitation_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeUserLinkInvitation"
  ADD CONSTRAINT "EmployeeUserLinkInvitation_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeUserLinkInvitation"
  ADD CONSTRAINT "EmployeeUserLinkInvitation_invitedByUserId_fkey"
  FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmployeeUserLinkInvitation"
  ADD CONSTRAINT "EmployeeUserLinkInvitation_acceptedByUserId_fkey"
  FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
DECLARE
  linked_count INTEGER;
  unlinked_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO linked_count FROM "Employee" WHERE "userId" IS NOT NULL;
  SELECT COUNT(*) INTO unlinked_count FROM "Employee" WHERE "userId" IS NULL;
  RAISE NOTICE '2E2 backfill SAFE AUTO-LINK=% UNLINKED=%', linked_count, unlinked_count;
END $$;
