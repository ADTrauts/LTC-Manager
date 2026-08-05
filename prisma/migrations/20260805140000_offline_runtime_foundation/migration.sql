-- Phase 6A Offline Runtime Foundation — sync audit and conflict persistence.
-- Additive only; safe on empty databases.

CREATE TYPE "OfflineConflictResolution" AS ENUM (
  'PENDING',
  'MARKED_DUPLICATE',
  'APPLIED_AS_CORRECTION',
  'REJECTED_WITH_REASON'
);

CREATE TABLE "OfflineBundleIssuance" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmployeeId" TEXT,
    "actorRole" "RoleKey" NOT NULL,
    "authMethod" "SessionAuthMethod" NOT NULL,
    "deviceFacilityId" TEXT NOT NULL,
    "deviceBoundUnitId" TEXT,
    "sessionVersion" INTEGER NOT NULL,
    "bundleVersion" TEXT NOT NULL,
    "serverRevision" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offlineAuthorizedUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineBundleIssuance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfflineSyncReceipt" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    "resultCategory" TEXT NOT NULL,
    "reasonCode" TEXT,
    "actorUserId" TEXT,
    "actorEmployeeId" TEXT,
    "sessionVersion" INTEGER NOT NULL,
    "deviceBoundUnitId" TEXT,
    "locallyRecordedAt" TIMESTAMP(3),
    "serverAcceptedAt" TIMESTAMP(3),
    "milestoneEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineSyncReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfflineConflict" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "conflictCategory" TEXT NOT NULL,
    "commandPayload" JSONB NOT NULL,
    "authoritativeState" JSONB NOT NULL,
    "reasonCode" TEXT,
    "resolution" "OfflineConflictResolution" NOT NULL DEFAULT 'PENDING',
    "resolvedByUserId" TEXT,
    "resolvedByEmployeeId" TEXT,
    "resolutionReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineConflict_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OfflineBundleIssuance_facilityId_unitId_issuedAt_idx" ON "OfflineBundleIssuance"("facilityId", "unitId", "issuedAt");
CREATE INDEX "OfflineSyncReceipt_facilityId_unitId_createdAt_idx" ON "OfflineSyncReceipt"("facilityId", "unitId", "createdAt");
CREATE UNIQUE INDEX "OfflineSyncReceipt_facilityId_unitId_clientCommandId_key" ON "OfflineSyncReceipt"("facilityId", "unitId", "clientCommandId");
CREATE INDEX "OfflineConflict_facilityId_unitId_resolution_idx" ON "OfflineConflict"("facilityId", "unitId", "resolution");
CREATE UNIQUE INDEX "OfflineConflict_facilityId_unitId_clientCommandId_key" ON "OfflineConflict"("facilityId", "unitId", "clientCommandId");

ALTER TABLE "OfflineBundleIssuance" ADD CONSTRAINT "OfflineBundleIssuance_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfflineBundleIssuance" ADD CONSTRAINT "OfflineBundleIssuance_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfflineSyncReceipt" ADD CONSTRAINT "OfflineSyncReceipt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfflineSyncReceipt" ADD CONSTRAINT "OfflineSyncReceipt_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfflineConflict" ADD CONSTRAINT "OfflineConflict_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfflineConflict" ADD CONSTRAINT "OfflineConflict_resolvedByEmployeeId_fkey" FOREIGN KEY ("resolvedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
