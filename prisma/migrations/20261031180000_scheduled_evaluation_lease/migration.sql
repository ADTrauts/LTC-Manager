-- Scheduled Evaluation lease. One row per evaluator.
-- A partial index keeps the open-episode scan bounded.

CREATE TABLE "ScheduledEvaluationLease" (
    "evaluatorKey" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "lockedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledEvaluationLease_pkey" PRIMARY KEY ("evaluatorKey")
);

CREATE INDEX "CoverageEpisode_open_facility_idx"
ON "CoverageEpisode" ("facilityId", "serviceDate")
WHERE "closedAt" IS NULL;
