-- Menu cycle settings and editable menu items by day/meal/category.
CREATE TYPE "MenuWeekStartDay" AS ENUM ('SUNDAY', 'MONDAY');

CREATE TABLE "MenuSettings" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "cycleLengthWeeks" INTEGER NOT NULL DEFAULT 3,
  "weekStartsOn" "MenuWeekStartDay" NOT NULL DEFAULT 'SUNDAY',
  "cycleAnchorDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MenuSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MenuItem" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "weekNumber" INTEGER NOT NULL,
  "dayIndex" INTEGER NOT NULL,
  "mealType" "MealType" NOT NULL,
  "category" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuSettings_facilityId_key" ON "MenuSettings"("facilityId");
CREATE INDEX "MenuItem_facilityId_weekNumber_dayIndex_mealType_idx" ON "MenuItem"("facilityId", "weekNumber", "dayIndex", "mealType");
CREATE INDEX "MenuItem_facilityId_weekNumber_dayIndex_mealType_category_idx" ON "MenuItem"("facilityId", "weekNumber", "dayIndex", "mealType", "category");

ALTER TABLE "MenuSettings"
  ADD CONSTRAINT "MenuSettings_facilityId_fkey"
  FOREIGN KEY ("facilityId")
  REFERENCES "Facility"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "MenuItem"
  ADD CONSTRAINT "MenuItem_facilityId_fkey"
  FOREIGN KEY ("facilityId")
  REFERENCES "Facility"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
