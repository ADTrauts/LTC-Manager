-- Per meal period (breakfast / lunch / dinner) for servery timing; unique is now per unit, day, and meal.
ALTER TABLE "ServeryMealServiceEvent" ADD COLUMN "mealType" "MealType" NOT NULL DEFAULT 'BREAKFAST';

ALTER TABLE "ServeryMealServiceEvent" ALTER COLUMN "mealType" DROP DEFAULT;

DROP INDEX IF EXISTS "ServeryMealServiceEvent_unitId_serviceDate_key";

CREATE UNIQUE INDEX "ServeryMealServiceEvent_unitId_serviceDate_mealType_key"
  ON "ServeryMealServiceEvent"("unitId", "serviceDate", "mealType");
