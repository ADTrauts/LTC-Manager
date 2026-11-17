BEGIN;

-- Leave previously issued consent intact. Legacy records have no request identity.
ALTER TABLE "HarborAssistanceConsent" ADD COLUMN "requestId" UUID;
CREATE UNIQUE INDEX "HarborAssistanceConsent_requestId_key" ON "HarborAssistanceConsent"("requestId");

CREATE TYPE "HarborAssistanceConsentAuditAction" AS ENUM (
    'ASSISTANCE_CONSENT_RECORDED',
    'ASSISTANCE_CONSENT_WITHDRAWN'
);

-- Customer actors have a separate table so ordinary Harbor staff audit writes
-- still work on the old schema. Audit identifiers are snapshots, not cascading relations.
CREATE TABLE "HarborAssistanceConsentAuditEvent" (
    "id" TEXT NOT NULL,
    "action" "HarborAssistanceConsentAuditAction" NOT NULL,
    "administratorId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "subjectStaffId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "grantId" TEXT,
    "sessionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "operation" "HarborAssistanceOperation" NOT NULL,
    "purpose" "HarborAssistancePurpose" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HarborAssistanceConsentAuditEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HarborAssistanceConsentAuditEvent_scope" CHECK (
        (cardinality("sessionIds") = 0 OR "grantId" IS NOT NULL)
        AND ("action" <> 'ASSISTANCE_CONSENT_RECORDED' OR "grantId" IS NULL)
    )
);

CREATE INDEX "HarborAssistanceConsentAuditEvent_facilityId_createdAt_idx"
    ON "HarborAssistanceConsentAuditEvent"("facilityId", "createdAt");

COMMIT;
