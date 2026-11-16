BEGIN;
-- CreateEnum
CREATE TYPE "HarborAssistanceOperation" AS ENUM ('FACILITY_STRUCTURE_READ');

-- CreateEnum
CREATE TYPE "HarborAssistancePurpose" AS ENUM ('FACILITY_STRUCTURE_REVIEW');

-- CreateEnum
CREATE TYPE "HarborAssistanceEndReason" AS ENUM ('STAFF_EXIT', 'HARBOR_LOGOUT', 'GRANT_REVOKED');

-- AlterEnum
ALTER TYPE "HarborAuditAction" ADD VALUE 'ASSISTANCE_START';
ALTER TYPE "HarborAuditAction" ADD VALUE 'ASSISTANCE_END';
ALTER TYPE "HarborAuditAction" ADD VALUE 'ASSISTANCE_GRANT_REVOKE';
ALTER TYPE "HarborAuditAction" ADD VALUE 'ASSISTANCE_LOGIN_END';

-- Add details to the existing Harbor event stream without changing ordinary audit writes.
CREATE TABLE "HarborAssistanceAuditDetail" (
    "eventId" TEXT NOT NULL,
    "grantId" TEXT,
    "sessionId" TEXT,
    "loginKey" VARCHAR(64),
    CONSTRAINT "HarborAssistanceAuditDetail_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "HarborFacilityGrant" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "operations" "HarborAssistanceOperation"[],
    "approvedByStaffId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByStaffId" TEXT,

    CONSTRAINT "HarborFacilityGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarborAssistanceSession" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "loginKey" VARCHAR(64) NOT NULL,
    "requestId" UUID NOT NULL,
    "purpose" "HarborAssistancePurpose" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endReason" "HarborAssistanceEndReason",
    "endedByStaffId" TEXT,

    CONSTRAINT "HarborAssistanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HarborFacilityGrant_staffId_facilityId_startsAt_idx" ON "HarborFacilityGrant"("staffId", "facilityId", "startsAt");

-- CreateIndex
CREATE INDEX "HarborFacilityGrant_facilityId_startsAt_idx" ON "HarborFacilityGrant"("facilityId", "startsAt");

-- CreateIndex
CREATE INDEX "HarborAssistanceSession_grantId_endedAt_idx" ON "HarborAssistanceSession"("grantId", "endedAt");

-- CreateIndex
CREATE INDEX "HarborAssistanceSession_loginKey_endedAt_idx" ON "HarborAssistanceSession"("loginKey", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HarborAssistanceSession_loginKey_requestId_key" ON "HarborAssistanceSession"("loginKey", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "HarborAssistanceAuditDetail_loginKey_key" ON "HarborAssistanceAuditDetail"("loginKey");
CREATE INDEX "HarborAssistanceAuditDetail_sessionId_idx" ON "HarborAssistanceAuditDetail"("sessionId");

-- AddForeignKey
ALTER TABLE "HarborFacilityGrant" ADD CONSTRAINT "HarborFacilityGrant_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarborFacilityGrant" ADD CONSTRAINT "HarborFacilityGrant_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarborFacilityGrant" ADD CONSTRAINT "HarborFacilityGrant_approvedByStaffId_fkey" FOREIGN KEY ("approvedByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarborFacilityGrant" ADD CONSTRAINT "HarborFacilityGrant_revokedByStaffId_fkey" FOREIGN KEY ("revokedByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarborAssistanceSession" ADD CONSTRAINT "HarborAssistanceSession_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "HarborFacilityGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarborAssistanceSession" ADD CONSTRAINT "HarborAssistanceSession_endedByStaffId_fkey" FOREIGN KEY ("endedByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HarborAssistanceAuditDetail" ADD CONSTRAINT "HarborAssistanceAuditDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HarborAuditEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keep interval and terminal-state invariants in the database as well as the service.
ALTER TABLE "HarborFacilityGrant"
  ADD CONSTRAINT "HarborFacilityGrant_scope" CHECK (
    "operations" IS NOT NULL AND cardinality("operations") BETWEEN 1 AND 8
    AND array_position("operations", NULL) IS NULL
  ),
  ADD CONSTRAINT "HarborFacilityGrant_interval" CHECK (
    isfinite("approvedAt") AND isfinite("startsAt") AND isfinite("expiresAt")
    AND "approvedAt" <= "startsAt" AND "startsAt" < "expiresAt"
  ),
  ADD CONSTRAINT "HarborFacilityGrant_revocation" CHECK (
    ("revokedAt" IS NULL AND "revokedByStaffId" IS NULL)
    OR ("revokedAt" IS NOT NULL AND "revokedByStaffId" IS NOT NULL
      AND isfinite("revokedAt") AND "revokedAt" >= "approvedAt")
  );

ALTER TABLE "HarborAssistanceSession"
  ADD CONSTRAINT "HarborAssistanceSession_login_key" CHECK ("loginKey" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "HarborAssistanceSession_interval" CHECK (
    isfinite("startedAt") AND isfinite("expiresAt") AND "startedAt" < "expiresAt"
  ),
  ADD CONSTRAINT "HarborAssistanceSession_end" CHECK (
    ("endedAt" IS NULL AND "endReason" IS NULL AND "endedByStaffId" IS NULL)
    OR ("endedAt" IS NOT NULL AND "endReason" IS NOT NULL AND "endedByStaffId" IS NOT NULL
      AND isfinite("endedAt") AND "endedAt" >= "startedAt")
  );

ALTER TABLE "HarborAssistanceAuditDetail"
  ADD CONSTRAINT "HarborAssistanceAuditDetail_shape" CHECK (
    ("loginKey" IS NOT NULL AND "loginKey" ~ '^[0-9a-f]{64}$' AND "grantId" IS NULL AND "sessionId" IS NULL)
    OR ("loginKey" IS NULL AND "grantId" IS NOT NULL)
  );

COMMIT;
