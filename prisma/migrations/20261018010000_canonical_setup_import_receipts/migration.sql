CREATE TABLE "SetupImportBatch" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "facilityId" TEXT NOT NULL REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorKind" TEXT NOT NULL,
 "actorUserId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorStaffId" TEXT REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorSnapshot" JSONB NOT NULL,
 "dataset" TEXT NOT NULL, "mode" TEXT NOT NULL, "contractVersion" TEXT NOT NULL,
 "fileName" TEXT NOT NULL, "sourceHash" TEXT NOT NULL, "planDigest" TEXT NOT NULL,
 "reviewedPlan" JSONB NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseToken" TEXT, "leaseExpiresAt" TIMESTAMP(3),
 CONSTRAINT "SetupImportBatch_actor_check" CHECK (
  ("actorKind"='user' AND "actorUserId" IS NOT NULL AND "actorStaffId" IS NULL) OR
  ("actorKind"='harbor_staff' AND "actorStaffId" IS NOT NULL AND "actorUserId" IS NULL)
 )
);
CREATE INDEX "SetupImportBatch_facilityId_createdAt_idx" ON "SetupImportBatch"("facilityId","createdAt");
CREATE TABLE "SetupImportResult" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "batchId" TEXT NOT NULL REFERENCES "SetupImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "rowNumber" INTEGER NOT NULL, "phase" TEXT NOT NULL DEFAULT 'IMPORT', "attempt" INTEGER NOT NULL,
 "status" TEXT NOT NULL, "intendedKey" TEXT NOT NULL, "targetIds" JSONB NOT NULL,
 "message" TEXT NOT NULL, "confirmedDigest" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SetupImportResult_attempt_check" CHECK ("attempt">0 AND "rowNumber">1)
);
CREATE UNIQUE INDEX "SetupImportResult_batchId_rowNumber_phase_attempt_key" ON "SetupImportResult"("batchId","rowNumber","phase","attempt");
CREATE INDEX "SetupImportResult_batchId_rowNumber_idx" ON "SetupImportResult"("batchId","rowNumber");
