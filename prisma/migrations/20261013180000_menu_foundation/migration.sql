-- Menu foundation: first-class Menu identity owned by Facility + Department.
-- Reframe MenuSettings as MenuCycleSettings owned by Menu.
-- MenuItem gains menuId. facilityId remains during the compatibility window.

CREATE TYPE "MenuStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MenuStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Menu_facilityId_departmentId_status_idx" ON "Menu"("facilityId", "departmentId", "status");
CREATE INDEX "Menu_departmentId_status_idx" ON "Menu"("departmentId", "status");
CREATE INDEX "Menu_facilityId_status_name_idx" ON "Menu"("facilityId", "status", "name");

ALTER TABLE "Menu"
  ADD CONSTRAINT "Menu_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Menu"
  ADD CONSTRAINT "Menu_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MenuSettings" ADD COLUMN "menuId" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN "menuId" TEXT;

-- Migration heuristic only: attach existing facility menu data to the DIETARY department.
-- Do not guess EVS, Plant, or an arbitrary department when that row is missing.
INSERT INTO "Menu" ("id", "facilityId", "departmentId", "name", "status", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  d."facilityId",
  d."id",
  d."name" || ' Menu',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Department" d
WHERE d."key" = 'DIETARY'
  AND (
    EXISTS (SELECT 1 FROM "MenuSettings" s WHERE s."facilityId" = d."facilityId")
    OR EXISTS (SELECT 1 FROM "MenuItem" i WHERE i."facilityId" = d."facilityId")
  );

UPDATE "MenuSettings" s
SET "menuId" = m."id"
FROM "Menu" m
INNER JOIN "Department" d ON d."id" = m."departmentId"
WHERE s."facilityId" = m."facilityId"
  AND d."key" = 'DIETARY';

UPDATE "MenuItem" i
SET "menuId" = m."id"
FROM "Menu" m
INNER JOIN "Department" d ON d."id" = m."departmentId"
WHERE i."facilityId" = m."facilityId"
  AND d."key" = 'DIETARY';

-- Items without settings still need cycle defaults so the editor opens.
INSERT INTO "MenuSettings" (
  "id",
  "menuId",
  "facilityId",
  "cycleLengthWeeks",
  "weekStartsOn",
  "cycleAnchorDate",
  "periodConfigJson",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  m."id",
  m."facilityId",
  3,
  'SUNDAY',
  CURRENT_DATE,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Menu" m
WHERE NOT EXISTS (
  SELECT 1 FROM "MenuSettings" s WHERE s."menuId" = m."id"
);

DROP INDEX "MenuSettings_facilityId_key";

ALTER TABLE "MenuSettings" RENAME TO "MenuCycleSettings";

ALTER TABLE "MenuCycleSettings" RENAME CONSTRAINT "MenuSettings_pkey" TO "MenuCycleSettings_pkey";
ALTER TABLE "MenuCycleSettings" RENAME CONSTRAINT "MenuSettings_facilityId_fkey" TO "MenuCycleSettings_facilityId_fkey";

CREATE UNIQUE INDEX "MenuCycleSettings_menuId_key" ON "MenuCycleSettings"("menuId");
CREATE INDEX "MenuCycleSettings_facilityId_idx" ON "MenuCycleSettings"("facilityId");

ALTER TABLE "MenuCycleSettings"
  ADD CONSTRAINT "MenuCycleSettings_menuId_fkey"
  FOREIGN KEY ("menuId") REFERENCES "Menu"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "MenuItem_menuId_weekNumber_dayIndex_mealPeriodKey_idx"
  ON "MenuItem"("menuId", "weekNumber", "dayIndex", "mealPeriodKey");
CREATE INDEX "MenuItem_menuId_weekNumber_dayIndex_mealPeriodKey_category_idx"
  ON "MenuItem"("menuId", "weekNumber", "dayIndex", "mealPeriodKey", "category");

ALTER TABLE "MenuItem"
  ADD CONSTRAINT "MenuItem_menuId_fkey"
  FOREIGN KEY ("menuId") REFERENCES "Menu"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
