-- AlterTable
ALTER TABLE "SupportTicketAttachment" ADD COLUMN     "nextScanAt" TIMESTAMP(3),
ADD COLUMN     "scanCycle" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "scanFailureReason" TEXT,
ADD COLUMN     "scanLeaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "scanLeaseToken" TEXT,
ADD COLUMN     "scanResultCode" TEXT,
ADD COLUMN     "scannedAt" TIMESTAMP(3),
ADD COLUMN     "scannerEngineVersion" TEXT,
ADD COLUMN     "scannerProvider" TEXT,
ADD COLUMN     "scannerSignatureVersion" TEXT;

-- CreateTable
CREATE TABLE "SupportAttachmentScanAttempt" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "expectedSha256" TEXT NOT NULL,
    "expectedSizeBytes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "resultCode" TEXT,
    "engineVersion" TEXT,
    "signatureVersion" TEXT,
    "signatureUpdatedAt" TIMESTAMP(3),
    "scannedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAttachmentScanAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportAttachmentScanAttempt_attachmentId_createdAt_idx" ON "SupportAttachmentScanAttempt"("attachmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportAttachmentScanAttempt_attachmentId_cycle_attempt_key" ON "SupportAttachmentScanAttempt"("attachmentId", "cycle", "attempt");

-- AddForeignKey
ALTER TABLE "SupportAttachmentScanAttempt" ADD CONSTRAINT "SupportAttachmentScanAttempt_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "SupportTicketAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupportAttachmentScanAttempt" ADD CONSTRAINT "SupportAttachmentScanAttempt_bounds" CHECK ("attempt" BETWEEN 1 AND 3 AND "cycle">0 AND "expectedSizeBytes" BETWEEN 1 AND 10485760 AND "expectedSha256" ~ '^[a-f0-9]{64}$' AND "status" IN ('RUNNING','CLEAN','BLOCKED','FAILED','STALE'));
CREATE UNIQUE INDEX "SupportAttachmentScanAttempt_one_running" ON "SupportAttachmentScanAttempt" ("attachmentId") WHERE "status"='RUNNING';
CREATE FUNCTION "support_scan_attempt_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."status" <> 'RUNNING' OR ROW(NEW."attachmentId",NEW."cycle",NEW."attempt",NEW."expectedSha256",NEW."expectedSizeBytes") IS DISTINCT FROM ROW(OLD."attachmentId",OLD."cycle",OLD."attempt",OLD."expectedSha256",OLD."expectedSizeBytes") THEN RAISE EXCEPTION 'Scan binding and completed results are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "SupportAttachmentScanAttempt_immutable" BEFORE UPDATE ON "SupportAttachmentScanAttempt" FOR EACH ROW EXECUTE FUNCTION "support_scan_attempt_immutable"();
