-- Additive Runtime Key Time day expectations (configured / adjusted / actual per Room).
-- Legacy OperationalCycleDayExpectation (meal SERVICE_STARTED) is unchanged.

CREATE TABLE "OperationalCycleKeyTimeDayExpectation" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "cycleId" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "cycleVersion" INTEGER NOT NULL,
    "cycleLabel" TEXT NOT NULL,
    "parentCycleLabel" TEXT,
    "displayPath" TEXT NOT NULL,
    "keyTimeGroupId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "configuredDueLocal" TEXT NOT NULL,
    "adjustedDueLocal" TEXT,
    "adjustmentReason" TEXT,
    "adjustedAt" TIMESTAMP(3),
    "adjustedByUserId" TEXT,
    "adjustedByEmployeeId" TEXT,
    "actualDueLocal" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "completedByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalCycleKeyTimeDayExpectation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalCycleKeyTimeDayExpectation_serviceDate_cycleId_spaceId_key"
ON "OperationalCycleKeyTimeDayExpectation"("serviceDate", "cycleId", "spaceId");

CREATE INDEX "OperationalCycleKeyTimeDayExpectation_facilityId_departmentId_serviceDate_idx"
ON "OperationalCycleKeyTimeDayExpectation"("facilityId", "departmentId", "serviceDate");

CREATE INDEX "OperationalCycleKeyTimeDayExpectation_spaceId_serviceDate_idx"
ON "OperationalCycleKeyTimeDayExpectation"("spaceId", "serviceDate");

CREATE INDEX "OperationalCycleKeyTimeDayExpectation_cycleId_idx"
ON "OperationalCycleKeyTimeDayExpectation"("cycleId");

CREATE INDEX "OperationalCycleKeyTimeDayExpectation_keyTimeGroupId_idx"
ON "OperationalCycleKeyTimeDayExpectation"("keyTimeGroupId");

CREATE INDEX "OperationalCycleKeyTimeDayExpectation_adjustedByUserId_idx"
ON "OperationalCycleKeyTimeDayExpectation"("adjustedByUserId");

CREATE INDEX "OperationalCycleKeyTimeDayExpectation_adjustedByEmployeeId_idx"
ON "OperationalCycleKeyTimeDayExpectation"("adjustedByEmployeeId");

CREATE INDEX "OperationalCycleKeyTimeDayExpectation_completedByUserId_idx"
ON "OperationalCycleKeyTimeDayExpectation"("completedByUserId");

CREATE INDEX "OperationalCycleKeyTimeDayExpectation_completedByEmployeeId_idx"
ON "OperationalCycleKeyTimeDayExpectation"("completedByEmployeeId");

ALTER TABLE "OperationalCycleKeyTimeDayExpectation"
ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_facilityId_fkey"
FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalCycleKeyTimeDayExpectation"
ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalCycleKeyTimeDayExpectation"
ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_cycleId_fkey"
FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalCycleKeyTimeDayExpectation"
ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_keyTimeGroupId_fkey"
FOREIGN KEY ("keyTimeGroupId") REFERENCES "DepartmentOperationalCycleKeyTimeGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalCycleKeyTimeDayExpectation"
ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_spaceId_fkey"
FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalCycleKeyTimeDayExpectation"
ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_adjustedByUserId_fkey"
FOREIGN KEY ("adjustedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalCycleKeyTimeDayExpectation"
ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_adjustedByEmployeeId_fkey"
FOREIGN KEY ("adjustedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalCycleKeyTimeDayExpectation"
ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_completedByUserId_fkey"
FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalCycleKeyTimeDayExpectation"
ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_completedByEmployeeId_fkey"
FOREIGN KEY ("completedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
