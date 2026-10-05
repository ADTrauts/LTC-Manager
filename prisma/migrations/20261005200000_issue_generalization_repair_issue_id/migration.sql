-- Phase 3A: canonical Issue generalization + Issue → many Work Orders.
-- Persistence names stay AssetIssue / Repair.
-- Additive schema + deterministic backfill. No identity rewrite.

-- Location-only Issues: Asset is optional.
ALTER TABLE "AssetIssue" ALTER COLUMN "assetId" DROP NOT NULL;

-- Authoritative Work Order → Issue FK (many Work Orders per Issue).
ALTER TABLE "Repair" ADD COLUMN "issueId" TEXT;

CREATE INDEX "Repair_issueId_idx" ON "Repair"("issueId");

ALTER TABLE "Repair" ADD CONSTRAINT "Repair_issueId_fkey"
  FOREIGN KEY ("issueId") REFERENCES "AssetIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Many Requests may link to one Issue.
DROP INDEX IF EXISTS "OperationalRequest_relatedAssetIssueId_key";

-- Fail closed if a Repair already points at a different Issue than its compatibility WO link.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AssetIssue" ai
    INNER JOIN "Repair" r ON r.id = ai."workOrderId"
    WHERE r."issueId" IS NOT NULL
      AND r."issueId" <> ai.id
  ) THEN
    RAISE EXCEPTION 'Phase 3A backfill conflict: Repair.issueId already set to a different Issue than AssetIssue.workOrderId';
  END IF;
END $$;

-- Backfill Repair.issueId from the legacy 1:1 AssetIssue.workOrderId pointer.
-- Does not create/delete Issues or Repairs. Does not rewrite statuses.
UPDATE "Repair" AS r
SET "issueId" = ai.id
FROM "AssetIssue" AS ai
WHERE ai."workOrderId" = r.id
  AND r."issueId" IS NULL;
