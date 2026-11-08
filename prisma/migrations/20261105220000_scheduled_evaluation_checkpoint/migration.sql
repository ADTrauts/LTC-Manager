-- Continuation and health for the existing Scheduled Evaluation lease. Not a second scheduler.
ALTER TABLE "ScheduledEvaluationLease" ADD COLUMN "resumeAfter" TEXT;
ALTER TABLE "ScheduledEvaluationLease" ADD COLUMN "resumeFacilityId" TEXT;
ALTER TABLE "ScheduledEvaluationLease" ADD COLUMN "lastAttemptedAt" TIMESTAMP(3);
ALTER TABLE "ScheduledEvaluationLease" ADD COLUMN "lastSucceededAt" TIMESTAMP(3);
ALTER TABLE "ScheduledEvaluationLease" ADD COLUMN "lastOutcome" TEXT;
ALTER TABLE "ScheduledEvaluationLease" ADD COLUMN "lastFailureCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ScheduledEvaluationLease" ADD COLUMN "lastProcessingFailureCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ScheduledEvaluationLease" ADD COLUMN "lastCycleCompletedAt" TIMESTAMP(3);
