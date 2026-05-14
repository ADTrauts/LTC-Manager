-- Track servery meal-service readiness and actual service start per unit/day.
CREATE TABLE "ServeryMealServiceEvent" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "serviceDate" DATE NOT NULL,
  "mealServiceReadyAt" TIMESTAMP(3),
  "mealServiceStartedAt" TIMESTAMP(3),
  "readyRecordedById" TEXT,
  "startedRecordedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServeryMealServiceEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServeryMealServiceEvent_unitId_serviceDate_key"
  ON "ServeryMealServiceEvent"("unitId", "serviceDate");

CREATE INDEX "ServeryMealServiceEvent_serviceDate_idx"
  ON "ServeryMealServiceEvent"("serviceDate");

ALTER TABLE "ServeryMealServiceEvent"
  ADD CONSTRAINT "ServeryMealServiceEvent_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServeryMealServiceEvent"
  ADD CONSTRAINT "ServeryMealServiceEvent_readyRecordedById_fkey"
  FOREIGN KEY ("readyRecordedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServeryMealServiceEvent"
  ADD CONSTRAINT "ServeryMealServiceEvent_startedRecordedById_fkey"
  FOREIGN KEY ("startedRecordedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
