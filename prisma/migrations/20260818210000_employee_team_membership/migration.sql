-- Employee organizational membership on a Department Team.
-- Unique (employeeId, teamId). Primary-per-Department is enforced in the write transaction.

CREATE TABLE "EmployeeTeamMembership" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeTeamMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeTeamMembership_employeeId_teamId_key"
ON "EmployeeTeamMembership"("employeeId", "teamId");

CREATE INDEX "EmployeeTeamMembership_employeeId_idx"
ON "EmployeeTeamMembership"("employeeId");

CREATE INDEX "EmployeeTeamMembership_teamId_idx"
ON "EmployeeTeamMembership"("teamId");

ALTER TABLE "EmployeeTeamMembership"
ADD CONSTRAINT "EmployeeTeamMembership_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeTeamMembership"
ADD CONSTRAINT "EmployeeTeamMembership_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "DepartmentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
