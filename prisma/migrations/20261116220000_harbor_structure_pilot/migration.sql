BEGIN;
-- AlterEnum
ALTER TYPE "HarborAuditAction" ADD VALUE 'ASSISTANCE_GRANT_APPROVE';
ALTER TYPE "HarborAuditAction" ADD VALUE 'ASSISTANCE_READ';
ALTER TYPE "HarborAuditAction" ADD VALUE 'ASSISTANCE_READ_DENIED';

-- AlterEnum
ALTER TYPE "HarborAssistanceEndReason" ADD VALUE 'SWITCHED';
ALTER TYPE "HarborAssistanceEndReason" ADD VALUE 'CONSENT_WITHDRAWN';

-- AlterTable
ALTER TABLE "HarborAssistanceAuditDetail" ADD COLUMN     "operation" "HarborAssistanceOperation",
ADD COLUMN     "purpose" "HarborAssistancePurpose",
ADD COLUMN     "requestKey" UUID;

-- AlterTable
ALTER TABLE "HarborFacilityGrant" ADD COLUMN     "consentId" TEXT,
ADD COLUMN     "revokedByUserId" TEXT;

-- AlterTable
ALTER TABLE "HarborAssistanceSession" ADD COLUMN     "endedByUserId" TEXT;

-- CreateTable
CREATE TABLE "HarborAssistanceLoginReceipt" (
    "loginKey" VARCHAR(64) NOT NULL,
    "retainUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HarborAssistanceLoginReceipt_pkey" PRIMARY KEY ("loginKey")
);

-- CreateTable
CREATE TABLE "HarborAssistanceConsent" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "operation" "HarborAssistanceOperation" NOT NULL,
    "purpose" "HarborAssistancePurpose" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnByUserId" TEXT,

    CONSTRAINT "HarborAssistanceConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HarborFacilityGrant_consentId_key" ON "HarborFacilityGrant"("consentId");

-- AddForeignKey
ALTER TABLE "HarborAssistanceConsent" ADD CONSTRAINT "HarborAssistanceConsent_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarborAssistanceConsent" ADD CONSTRAINT "HarborAssistanceConsent_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarborAssistanceConsent" ADD CONSTRAINT "HarborAssistanceConsent_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarborAssistanceConsent" ADD CONSTRAINT "HarborAssistanceConsent_withdrawnByUserId_fkey" FOREIGN KEY ("withdrawnByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarborFacilityGrant" ADD CONSTRAINT "HarborFacilityGrant_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarborFacilityGrant" ADD CONSTRAINT "HarborFacilityGrant_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "HarborAssistanceConsent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarborAssistanceSession" ADD CONSTRAINT "HarborAssistanceSession_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Retire the audit table as the source of credential revocation. Legacy receipts did not store
-- signed expiry. The previous issuer capped credentials at 12 hours, so keep them conservatively.
INSERT INTO "HarborAssistanceLoginReceipt" ("loginKey", "retainUntil")
SELECT detail."loginKey", event."createdAt" + INTERVAL '12 hours'
FROM "HarborAssistanceAuditDetail" detail JOIN "HarborAuditEvent" event ON event."id" = detail."eventId"
WHERE detail."loginKey" IS NOT NULL;

ALTER TABLE "HarborAssistanceLoginReceipt" ADD CONSTRAINT "HarborAssistanceLoginReceipt_shape"
  CHECK ("loginKey" ~ '^[0-9a-f]{64}$' AND isfinite("retainUntil"));

CREATE FUNCTION protect_harbor_login_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."retainUntil" > (clock_timestamp() AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'Harbor logout receipt is still required' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER protect_harbor_login_receipt
  BEFORE UPDATE OR DELETE ON "HarborAssistanceLoginReceipt"
  FOR EACH ROW EXECUTE FUNCTION protect_harbor_login_receipt();

CREATE FUNCTION protect_harbor_login_receipt_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "HarborAssistanceLoginReceipt"
             WHERE "retainUntil" > (clock_timestamp() AT TIME ZONE 'UTC')) THEN
    RAISE EXCEPTION 'Harbor logout receipts are still required' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER protect_harbor_login_receipt_truncate
  BEFORE TRUNCATE ON "HarborAssistanceLoginReceipt"
  FOR EACH STATEMENT EXECUTE FUNCTION protect_harbor_login_receipt_truncate();

ALTER TABLE "HarborAssistanceConsent" ADD CONSTRAINT "HarborAssistanceConsent_interval"
  CHECK (isfinite("grantedAt") AND isfinite("expiresAt") AND "expiresAt" > "grantedAt"
    AND "expiresAt" <= "grantedAt" + INTERVAL '24 hours'),
  ADD CONSTRAINT "HarborAssistanceConsent_withdrawal" CHECK (
    ("withdrawnAt" IS NULL AND "withdrawnByUserId" IS NULL)
    OR ("withdrawnAt" IS NOT NULL AND "withdrawnByUserId" IS NOT NULL
        AND isfinite("withdrawnAt") AND "withdrawnAt" >= "grantedAt")
  );

ALTER TABLE "HarborFacilityGrant" DROP CONSTRAINT "HarborFacilityGrant_revocation",
  ADD CONSTRAINT "HarborFacilityGrant_revocation" CHECK (
    ("revokedAt" IS NULL AND num_nonnulls("revokedByStaffId", "revokedByUserId") = 0)
    OR (isfinite("revokedAt") AND "revokedAt" IS NOT NULL AND "revokedAt" >= "approvedAt"
      AND num_nonnulls("revokedByStaffId", "revokedByUserId") = 1)
  ),
  ADD CONSTRAINT "HarborFacilityGrant_pilot" CHECK ("consentId" IS NULL OR (
    "staffId" <> "approvedByStaffId" AND "expiresAt" <= "approvedAt" + INTERVAL '24 hours'
    AND cardinality("operations") = 1
  ));

ALTER TABLE "HarborAssistanceSession" DROP CONSTRAINT "HarborAssistanceSession_end",
  ADD CONSTRAINT "HarborAssistanceSession_end" CHECK (
    ("endedAt" IS NULL AND "endReason" IS NULL AND num_nonnulls("endedByStaffId", "endedByUserId") = 0)
    OR ("endedAt" IS NOT NULL AND "endReason" IS NOT NULL AND isfinite("endedAt")
      AND "endedAt" >= "startedAt" AND num_nonnulls("endedByStaffId", "endedByUserId") = 1)
  );

-- Fail migration on overlapping legacy rows. Operations must review the data before retrying.
CREATE UNIQUE INDEX "HarborAssistanceSession_one_open_login"
  ON "HarborAssistanceSession" ("loginKey") WHERE "endedAt" IS NULL;

ALTER TABLE "HarborAssistanceAuditDetail" DROP CONSTRAINT "HarborAssistanceAuditDetail_shape",
  ADD CONSTRAINT "HarborAssistanceAuditDetail_shape" CHECK (
    ("loginKey" IS NOT NULL AND "loginKey" ~ '^[0-9a-f]{64}$'
      AND "grantId" IS NULL AND "sessionId" IS NULL AND "requestKey" IS NULL)
    OR ("loginKey" IS NULL AND ("grantId" IS NOT NULL
      OR ("requestKey" IS NOT NULL AND "sessionId" IS NULL)))
  );

COMMIT;
