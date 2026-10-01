-- Phase C: Key Point occurrence tracking, date-specific timing adjustments,
-- and append-only Key Point actuals. Published Cycle rows are not rewritten.
-- Existing Key Points default to REQUIRED + LOCATION so current completion
-- behavior stays readable.

CREATE TYPE "OperationalCycleOccurrenceTracking" AS ENUM ('NONE', 'OPTIONAL', 'REQUIRED');
CREATE TYPE "OperationalCycleKeyPointGrain" AS ENUM ('DEPARTMENT', 'LOCATION');

ALTER TABLE "DepartmentOperationalCycle"
ADD COLUMN "occurrenceTracking" "OperationalCycleOccurrenceTracking" NOT NULL DEFAULT 'REQUIRED',
ADD COLUMN "keyPointGrain" "OperationalCycleKeyPointGrain" NOT NULL DEFAULT 'LOCATION';

CREATE TABLE "OperationalCycleTimingAdjustment" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "serviceDate" DATE NOT NULL,
  "cycleId" TEXT NOT NULL,
  "cycleStableKey" TEXT NOT NULL,
  "cycleVersion" INTEGER NOT NULL,
  "adjustedStartLocal" TEXT,
  "adjustedEndLocal" TEXT,
  "adjustedDueLocal" TEXT,
  "reason" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmployeeId" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalCycleTimingAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationalCycleTimingAdjustment_facilityId_departmentId_serviceDate_idx"
ON "OperationalCycleTimingAdjustment"("facilityId", "departmentId", "serviceDate");
CREATE INDEX "OperationalCycleTimingAdjustment_cycleStableKey_serviceDate_idx"
ON "OperationalCycleTimingAdjustment"("cycleStableKey", "serviceDate");
CREATE INDEX "OperationalCycleTimingAdjustment_cycleId_idx"
ON "OperationalCycleTimingAdjustment"("cycleId");

ALTER TABLE "OperationalCycleTimingAdjustment"
ADD CONSTRAINT "OperationalCycleTimingAdjustment_cycleId_fkey"
FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OperationalCycleKeyPointActual" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "serviceDate" DATE NOT NULL,
  "cycleId" TEXT NOT NULL,
  "cycleStableKey" TEXT NOT NULL,
  "cycleVersion" INTEGER NOT NULL,
  "spaceId" TEXT,
  "actualLocal" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorUserId" TEXT,
  "actorEmployeeId" TEXT,
  "correctionReason" TEXT,
  "correctsActualId" TEXT,
  CONSTRAINT "OperationalCycleKeyPointActual_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationalCycleKeyPointActual_facilityId_departmentId_serviceDate_cycleStableKey_idx"
ON "OperationalCycleKeyPointActual"("facilityId", "departmentId", "serviceDate", "cycleStableKey");
CREATE INDEX "OperationalCycleKeyPointActual_cycleId_serviceDate_idx"
ON "OperationalCycleKeyPointActual"("cycleId", "serviceDate");
CREATE INDEX "OperationalCycleKeyPointActual_correctsActualId_idx"
ON "OperationalCycleKeyPointActual"("correctsActualId");

ALTER TABLE "OperationalCycleKeyPointActual"
ADD CONSTRAINT "OperationalCycleKeyPointActual_cycleId_fkey"
FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
