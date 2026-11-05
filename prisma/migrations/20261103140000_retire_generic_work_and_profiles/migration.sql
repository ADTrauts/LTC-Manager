-- Retire generic Work and the Department profile / Experience / Location Function store.
-- No customer data. Test rows are dropped with the tables.

-- Cycles no longer target by unit type, room type, or operational type.
UPDATE "DepartmentOperationalCycle"
SET "locationMode" = 'EXPLICIT_UNITS'
WHERE "locationMode"::text IN ('UNIT_TYPES', 'ROOM_TYPE', 'OPERATIONAL_TYPES');

DROP INDEX IF EXISTS "DepartmentOperationalCycle_departmentId_roomTypeKey_idx";
ALTER TABLE "DepartmentOperationalCycle" DROP COLUMN IF EXISTS "applicableUnitTypes";
ALTER TABLE "DepartmentOperationalCycle" DROP COLUMN IF EXISTS "roomTypeKey";
ALTER TABLE "DepartmentOperationalCycle" DROP COLUMN IF EXISTS "applicableOperationalTypeKeys";

ALTER TABLE "DepartmentOperationalCycle" ALTER COLUMN "locationMode" DROP DEFAULT;
CREATE TYPE "OperationalCycleLocationMode_new" AS ENUM ('ALL_DEPARTMENT_UNITS', 'EXPLICIT_UNITS');
ALTER TABLE "DepartmentOperationalCycle"
  ALTER COLUMN "locationMode" TYPE "OperationalCycleLocationMode_new"
  USING ("locationMode"::text::"OperationalCycleLocationMode_new");
ALTER TABLE "DepartmentOperationalCycle"
  ALTER COLUMN "locationMode" SET DEFAULT 'ALL_DEPARTMENT_UNITS';
DROP TYPE "OperationalCycleLocationMode";
ALTER TYPE "OperationalCycleLocationMode_new" RENAME TO "OperationalCycleLocationMode";

-- Coverage does not store a Location Function key.
ALTER TABLE "OperationalAssignmentTemplateItem" DROP COLUMN IF EXISTS "applicableOperationalTypeKeys";

-- Records do not target a Location Function. Drop those attachments, then the column and enum value.
DELETE FROM "LogAttachment" WHERE "targetKind"::text = 'OPERATIONAL_TYPE';
DROP INDEX IF EXISTS "LogAttachment_operationalTypeKey_idx";
ALTER TABLE "LogAttachment" DROP COLUMN IF EXISTS "operationalTypeKey";

ALTER TABLE "LogAttachment" DROP CONSTRAINT "LogAttachment_target_exclusivity_check";
CREATE TYPE "LogAttachmentTargetKind_new" AS ENUM ('ASSET', 'SPACE', 'UNIT', 'DEPARTMENT', 'FACILITY');
ALTER TABLE "LogAttachment"
  ALTER COLUMN "targetKind" TYPE "LogAttachmentTargetKind_new"
  USING ("targetKind"::text::"LogAttachmentTargetKind_new");
DROP TYPE "LogAttachmentTargetKind";
ALTER TYPE "LogAttachmentTargetKind_new" RENAME TO "LogAttachmentTargetKind";
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_target_exclusivity_check" CHECK (
  (
    "targetKind" = 'ASSET'::"LogAttachmentTargetKind"
    AND "assetId" IS NOT NULL
    AND "spaceId" IS NULL
    AND "unitId" IS NULL
    AND "targetDepartmentId" IS NULL
  )
  OR (
    "targetKind" = 'SPACE'::"LogAttachmentTargetKind"
    AND "spaceId" IS NOT NULL
    AND "assetId" IS NULL
    AND "unitId" IS NULL
    AND "targetDepartmentId" IS NULL
  )
  OR (
    "targetKind" = 'UNIT'::"LogAttachmentTargetKind"
    AND "unitId" IS NOT NULL
    AND "assetId" IS NULL
    AND "spaceId" IS NULL
    AND "targetDepartmentId" IS NULL
  )
  OR (
    "targetKind" = 'DEPARTMENT'::"LogAttachmentTargetKind"
    AND "targetDepartmentId" IS NOT NULL
    AND "assetId" IS NULL
    AND "spaceId" IS NULL
    AND "unitId" IS NULL
  )
  OR (
    "targetKind" = 'FACILITY'::"LogAttachmentTargetKind"
    AND "assetId" IS NULL
    AND "spaceId" IS NULL
    AND "unitId" IS NULL
    AND "targetDepartmentId" IS NULL
  )
);

-- Generic Work.
DROP TABLE IF EXISTS "DepartmentWorkEvent";
DROP TABLE IF EXISTS "DepartmentWorkOccurrence";
DROP TABLE IF EXISTS "DepartmentWorkPlanEvent";
DROP TABLE IF EXISTS "DepartmentWorkItem";
DROP TABLE IF EXISTS "DepartmentWorkPlanApplicability";
DROP TABLE IF EXISTS "DepartmentWorkPlan";

DROP TYPE IF EXISTS "DepartmentWorkEventType";
DROP TYPE IF EXISTS "DepartmentWorkOccurrenceStatus";
DROP TYPE IF EXISTS "DepartmentWorkOccurrenceSourceKind";
DROP TYPE IF EXISTS "DepartmentWorkApplicabilityKind";
DROP TYPE IF EXISTS "DepartmentWorkDueOffsetKind";
DROP TYPE IF EXISTS "DepartmentWorkScheduleKind";
DROP TYPE IF EXISTS "DepartmentWorkResponsibilityMode";
DROP TYPE IF EXISTS "DepartmentWorkCompletionMode";
DROP TYPE IF EXISTS "DepartmentWorkItemPriority";
DROP TYPE IF EXISTS "DepartmentWorkPlanStatus";

-- Profile, archetype, Operational Area, and Experience persistence.
DROP TABLE IF EXISTS "DepartmentRoomExperienceException";
DROP TABLE IF EXISTS "DepartmentRoomArchetypeBinding";
DROP TABLE IF EXISTS "DepartmentArchetypeExperience";
DROP TABLE IF EXISTS "DepartmentRoomArchetype";
DROP TABLE IF EXISTS "DepartmentAreaExperience";
DROP TABLE IF EXISTS "DepartmentOperationalArea";
DROP TABLE IF EXISTS "DepartmentOperationalProfile";

DROP TYPE IF EXISTS "RoomExperienceExceptionMode";
DROP TYPE IF EXISTS "OperationalProfileStatus";

-- Unused Facility Room Type record defaults.
DROP TABLE IF EXISTS "DepartmentLocationLogSuppression";
DROP TABLE IF EXISTS "DepartmentFacilityTypeLogDefault";
