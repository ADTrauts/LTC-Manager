-- Phase 3C: provenance for Issues created from a canonical Record.
-- Additive only. No historical backfill. No automatic Issue creation.

ALTER TABLE "AssetIssue"
ADD COLUMN "originEvidenceRecordId" TEXT;

ALTER TABLE "AssetIssue"
ADD CONSTRAINT "AssetIssue_originEvidenceRecordId_fkey"
FOREIGN KEY ("originEvidenceRecordId") REFERENCES "OperationalEvidenceRecord"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AssetIssue_originEvidenceRecordId_idx"
ON "AssetIssue"("originEvidenceRecordId");
