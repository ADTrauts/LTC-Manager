-- Team is an organizational grouping of people.
-- It does not own rooms, Location Function keys, or a cycle staffing need.

ALTER TABLE "DepartmentTeam" DROP COLUMN "applicableOperationalTypeKeys";

DROP TABLE "DepartmentTeamRoomMembership";

DROP TABLE "DepartmentTeamCycle";

DROP TYPE "DepartmentTeamCycleNeedGrain";
