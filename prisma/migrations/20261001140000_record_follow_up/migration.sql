-- Phase E: follow-up Records link to an originating Record.
-- Waiver remains a requirement declaration. No waiver rows are written.

ALTER TABLE "OperationalEvidenceRecord" ADD COLUMN "followsRecordId" TEXT;

CREATE INDEX "OperationalEvidenceRecord_followsRecordId_idx" ON "OperationalEvidenceRecord"("followsRecordId");

ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_followsRecordId_fkey" FOREIGN KEY ("followsRecordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LogAttachment" ADD COLUMN "waiverAllowed" BOOLEAN NOT NULL DEFAULT false;
