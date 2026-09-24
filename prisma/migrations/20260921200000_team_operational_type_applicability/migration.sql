-- Department Teams may target Operational Types without copying room membership rows.
-- Identity is DepartmentRoomArchetype.key. Team configuration remains unversioned.

ALTER TABLE "DepartmentTeam"
ADD COLUMN IF NOT EXISTS "applicableOperationalTypeKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
