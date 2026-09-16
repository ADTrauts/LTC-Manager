-- Runtime meal-service timing snapshot for one operational date + cycle version + Neighborhood.
-- Additive. Does not drop UnitMealTime. Does not rewrite ServeryMealServiceEvent.

CREATE TABLE "OperationalCycleDayExpectation" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "cycleId" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "cycleVersion" INTEGER NOT NULL,
    "cycleLabel" TEXT NOT NULL,
    "mealType" "MealType" NOT NULL,
    "unitId" TEXT NOT NULL,
    "milestone" "ServeryMilestone" NOT NULL,
    "configuredTime" TEXT,
    "adjustedTime" TEXT,
    "adjustmentReason" TEXT,
    "adjustedAt" TIMESTAMP(3),
    "adjustedByUserId" TEXT,
    "adjustedByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalCycleDayExpectation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalCycleDayExpectation_serviceDate_cycleId_unitId_milestone_key"
  ON "OperationalCycleDayExpectation"("serviceDate", "cycleId", "unitId", "milestone");

CREATE INDEX "OperationalCycleDayExpectation_facilityId_departmentId_serviceDate_idx"
  ON "OperationalCycleDayExpectation"("facilityId", "departmentId", "serviceDate");

CREATE INDEX "OperationalCycleDayExpectation_unitId_serviceDate_idx"
  ON "OperationalCycleDayExpectation"("unitId", "serviceDate");

CREATE INDEX "OperationalCycleDayExpectation_cycleId_idx"
  ON "OperationalCycleDayExpectation"("cycleId");

CREATE INDEX "OperationalCycleDayExpectation_adjustedByUserId_idx"
  ON "OperationalCycleDayExpectation"("adjustedByUserId");

CREATE INDEX "OperationalCycleDayExpectation_adjustedByEmployeeId_idx"
  ON "OperationalCycleDayExpectation"("adjustedByEmployeeId");

ALTER TABLE "OperationalCycleDayExpectation"
  ADD CONSTRAINT "OperationalCycleDayExpectation_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalCycleDayExpectation"
  ADD CONSTRAINT "OperationalCycleDayExpectation_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalCycleDayExpectation"
  ADD CONSTRAINT "OperationalCycleDayExpectation_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalCycleDayExpectation"
  ADD CONSTRAINT "OperationalCycleDayExpectation_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalCycleDayExpectation"
  ADD CONSTRAINT "OperationalCycleDayExpectation_adjustedByUserId_fkey"
  FOREIGN KEY ("adjustedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalCycleDayExpectation"
  ADD CONSTRAINT "OperationalCycleDayExpectation_adjustedByEmployeeId_fkey"
  FOREIGN KEY ("adjustedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
