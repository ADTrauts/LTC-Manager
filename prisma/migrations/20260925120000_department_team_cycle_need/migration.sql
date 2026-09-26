-- Team × department cycle link and staffing need.
-- Cycles stay department-owned; this row is the team's need on that identity.

CREATE TYPE "DepartmentTeamCycleNeedGrain" AS ENUM ('TOTAL', 'PER_ROOM');

CREATE TABLE "DepartmentTeamCycle" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "requiredCount" INTEGER,
    "grain" "DepartmentTeamCycleNeedGrain" NOT NULL DEFAULT 'TOTAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentTeamCycle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentTeamCycle_teamId_cycleStableKey_key"
ON "DepartmentTeamCycle"("teamId", "cycleStableKey");

CREATE INDEX "DepartmentTeamCycle_departmentId_cycleStableKey_idx"
ON "DepartmentTeamCycle"("departmentId", "cycleStableKey");

CREATE INDEX "DepartmentTeamCycle_facilityId_departmentId_idx"
ON "DepartmentTeamCycle"("facilityId", "departmentId");

ALTER TABLE "DepartmentTeamCycle"
ADD CONSTRAINT "DepartmentTeamCycle_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "DepartmentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentTeamCycle"
ADD CONSTRAINT "DepartmentTeamCycle_facilityId_fkey"
FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentTeamCycle"
ADD CONSTRAINT "DepartmentTeamCycle_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
