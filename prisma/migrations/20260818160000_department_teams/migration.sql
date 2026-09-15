-- Department Teams: optional enduring organizational subgroups inside one Department.
-- No starter data. Room membership is UnitSpace.id only.

CREATE TYPE "DepartmentTeamStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "DepartmentTeam" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "status" "DepartmentTeamStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "managerEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DepartmentTeamRoomMembership" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentTeamRoomMembership_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DepartmentTeam_facilityId_departmentId_status_displayOrder_idx"
ON "DepartmentTeam"("facilityId", "departmentId", "status", "displayOrder");

CREATE INDEX "DepartmentTeam_departmentId_status_idx"
ON "DepartmentTeam"("departmentId", "status");

CREATE INDEX "DepartmentTeam_managerEmployeeId_idx"
ON "DepartmentTeam"("managerEmployeeId");

CREATE UNIQUE INDEX "DepartmentTeamRoomMembership_teamId_spaceId_key"
ON "DepartmentTeamRoomMembership"("teamId", "spaceId");

CREATE INDEX "DepartmentTeamRoomMembership_spaceId_idx"
ON "DepartmentTeamRoomMembership"("spaceId");

ALTER TABLE "DepartmentTeam"
ADD CONSTRAINT "DepartmentTeam_facilityId_fkey"
FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentTeam"
ADD CONSTRAINT "DepartmentTeam_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentTeam"
ADD CONSTRAINT "DepartmentTeam_managerEmployeeId_fkey"
FOREIGN KEY ("managerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DepartmentTeamRoomMembership"
ADD CONSTRAINT "DepartmentTeamRoomMembership_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "DepartmentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentTeamRoomMembership"
ADD CONSTRAINT "DepartmentTeamRoomMembership_spaceId_fkey"
FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
