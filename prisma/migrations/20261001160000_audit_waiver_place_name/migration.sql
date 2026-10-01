-- Phase F: sparse Record waivers, forward place-name history, and Record place snapshots.
-- No backfill. Dates before the first PlaceNameChange stay unresolved.

ALTER TABLE "OperationalEvidenceRecord" ADD COLUMN "placeLabelSnapshot" TEXT;

CREATE TABLE "OperationalRecordWaiver" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "operationalDate" DATE NOT NULL,
    "logAttachmentId" TEXT,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT,
    "recordedByEmployeeId" TEXT,
    "recordedByLabel" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalRecordWaiver_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalRecordWaiver_facilityId_requirementKey_key" ON "OperationalRecordWaiver"("facilityId", "requirementKey");
CREATE INDEX "OperationalRecordWaiver_facilityId_departmentId_operationalDate_idx" ON "OperationalRecordWaiver"("facilityId", "departmentId", "operationalDate");

CREATE TABLE "PlaceNameChange" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "placeKind" TEXT NOT NULL,
    "unitSpaceId" TEXT,
    "unitId" TEXT,
    "previousLabel" TEXT NOT NULL,
    "newLabel" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT,

    CONSTRAINT "PlaceNameChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlaceNameChange_facilityId_unitSpaceId_effectiveFrom_idx" ON "PlaceNameChange"("facilityId", "unitSpaceId", "effectiveFrom");
CREATE INDEX "PlaceNameChange_facilityId_unitId_effectiveFrom_idx" ON "PlaceNameChange"("facilityId", "unitId", "effectiveFrom");
