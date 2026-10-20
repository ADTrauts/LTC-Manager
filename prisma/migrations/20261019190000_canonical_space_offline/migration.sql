-- Additive space/1 transport metadata; preserve every historical issuance/receipt.
ALTER TABLE "OfflineBundleIssuance" ADD COLUMN "spaceScope" JSONB,
 ADD COLUMN "spaceManifest" JSONB, ADD COLUMN "recoveryKeyEnvelope" JSONB,
 ADD COLUMN "recoveryAfter" TIMESTAMP(3);
ALTER TABLE "OfflineSyncReceipt" ADD COLUMN "issuanceId" TEXT,
 ADD COLUMN "intentDigest" TEXT, ADD COLUMN "authoritativeRecordId" TEXT,
 ADD COLUMN "outcome" JSONB;
