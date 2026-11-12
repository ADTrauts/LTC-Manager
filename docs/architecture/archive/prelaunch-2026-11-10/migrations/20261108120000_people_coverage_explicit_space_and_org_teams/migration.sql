-- People & Coverage: Coverage names an explicit UnitSpace; Team is organization-only.
-- Reverses the Coverage/Team portions of 20261106214500_restore_schema_after_premature_retirement
-- without re-retiring generic Work or other restored surfaces.

-- Coverage need may name a canonical UnitSpace.
ALTER TABLE "OperationalAssignmentTemplateItem" DROP COLUMN IF EXISTS "applicableOperationalTypeKeys";

ALTER TABLE "OperationalAssignmentTemplateItem" ADD COLUMN IF NOT EXISTS "spaceId" TEXT;

CREATE INDEX IF NOT EXISTS "OperationalAssignmentTemplateItem_spaceId_idx"
  ON "OperationalAssignmentTemplateItem"("spaceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OperationalAssignmentTemplateItem_spaceId_fkey'
  ) THEN
    ALTER TABLE "OperationalAssignmentTemplateItem"
      ADD CONSTRAINT "OperationalAssignmentTemplateItem_spaceId_fkey"
      FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Team is an organizational grouping of people.
ALTER TABLE "DepartmentTeam" DROP COLUMN IF EXISTS "applicableOperationalTypeKeys";

DROP TABLE IF EXISTS "DepartmentTeamRoomMembership";

DROP TABLE IF EXISTS "DepartmentTeamCycle";

DROP TYPE IF EXISTS "DepartmentTeamCycleNeedGrain";
