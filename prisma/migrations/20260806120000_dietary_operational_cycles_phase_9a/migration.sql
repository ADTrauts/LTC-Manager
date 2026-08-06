-- Phase 9A: Department-owned Operational Cycles (Dietary day phases).
-- Additive only. Does not activate Operation Engine models.

CREATE TYPE "OperationalCycleType" AS ENUM ('PREPARATION', 'SERVICE', 'TRANSITION', 'CLOSEOUT', 'CUSTOM');
CREATE TYPE "OperationalCycleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');
CREATE TYPE "OperationalCycleLocationMode" AS ENUM ('ALL_DEPARTMENT_UNITS', 'UNIT_TYPES', 'EXPLICIT_UNITS');

CREATE TABLE "DepartmentOperationalCycle" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "cycleType" "OperationalCycleType" NOT NULL,
    "displaySequence" INTEGER NOT NULL DEFAULT 100,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "overnight" BOOLEAN NOT NULL DEFAULT false,
    "applicableDaysOfWeek" INTEGER[],
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "mealType" "MealType",
    "locationMode" "OperationalCycleLocationMode" NOT NULL DEFAULT 'ALL_DEPARTMENT_UNITS',
    "applicableUnitTypes" "UnitType"[],
    "expectedMilestones" "ServeryMilestone"[],
    "status" "OperationalCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "publishedByUserId" TEXT,
    "lastChangedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentOperationalCycle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentOperationalCycle_departmentId_stableKey_version_key"
  ON "DepartmentOperationalCycle"("departmentId", "stableKey", "version");
CREATE INDEX "DepartmentOperationalCycle_facilityId_departmentId_status_idx"
  ON "DepartmentOperationalCycle"("facilityId", "departmentId", "status");
CREATE INDEX "DepartmentOperationalCycle_facilityId_departmentId_effectiveFrom_idx"
  ON "DepartmentOperationalCycle"("facilityId", "departmentId", "effectiveFrom");
CREATE INDEX "DepartmentOperationalCycle_departmentId_displaySequence_idx"
  ON "DepartmentOperationalCycle"("departmentId", "displaySequence");
CREATE INDEX "DepartmentOperationalCycle_departmentId_status_displaySequence_idx"
  ON "DepartmentOperationalCycle"("departmentId", "status", "displaySequence");

ALTER TABLE "DepartmentOperationalCycle"
  ADD CONSTRAINT "DepartmentOperationalCycle_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentOperationalCycle"
  ADD CONSTRAINT "DepartmentOperationalCycle_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DepartmentOperationalCycleLocation" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentOperationalCycleLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentOperationalCycleLocation_cycleId_unitId_key"
  ON "DepartmentOperationalCycleLocation"("cycleId", "unitId");
CREATE INDEX "DepartmentOperationalCycleLocation_unitId_idx"
  ON "DepartmentOperationalCycleLocation"("unitId");

ALTER TABLE "DepartmentOperationalCycleLocation"
  ADD CONSTRAINT "DepartmentOperationalCycleLocation_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentOperationalCycleLocation"
  ADD CONSTRAINT "DepartmentOperationalCycleLocation_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DepartmentOperationalCycleEvent" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorLabel" TEXT,
    "detailJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentOperationalCycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DepartmentOperationalCycleEvent_cycleId_createdAt_idx"
  ON "DepartmentOperationalCycleEvent"("cycleId", "createdAt");
CREATE INDEX "DepartmentOperationalCycleEvent_facilityId_departmentId_createdAt_idx"
  ON "DepartmentOperationalCycleEvent"("facilityId", "departmentId", "createdAt");

ALTER TABLE "DepartmentOperationalCycleEvent"
  ADD CONSTRAINT "DepartmentOperationalCycleEvent_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
