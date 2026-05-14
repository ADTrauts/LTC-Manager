-- Customizable menu period/category builder.
ALTER TABLE "MenuSettings"
  ADD COLUMN "periodConfigJson" JSONB;

ALTER TABLE "MenuItem"
  ADD COLUMN "mealPeriodKey" TEXT NOT NULL DEFAULT 'BREAKFAST';

UPDATE "MenuItem"
SET "mealPeriodKey" = "mealType"::text;

DROP INDEX IF EXISTS "MenuItem_facilityId_weekNumber_dayIndex_mealType_idx";
DROP INDEX IF EXISTS "MenuItem_facilityId_weekNumber_dayIndex_mealType_category_idx";

ALTER TABLE "MenuItem"
  DROP COLUMN "mealType";

CREATE INDEX "MenuItem_facilityId_weekNumber_dayIndex_mealPeriodKey_idx"
  ON "MenuItem"("facilityId", "weekNumber", "dayIndex", "mealPeriodKey");

CREATE INDEX "MenuItem_facilityId_weekNumber_dayIndex_mealPeriodKey_category_idx"
  ON "MenuItem"("facilityId", "weekNumber", "dayIndex", "mealPeriodKey", "category");
