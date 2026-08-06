-- Phase 10A companion: backfill ACTIVE → OPERATIONAL after enum values committed.
UPDATE "Asset" SET "status" = 'OPERATIONAL' WHERE "status" = 'ACTIVE';
ALTER TABLE "Asset" ALTER COLUMN "status" SET DEFAULT 'OPERATIONAL';
