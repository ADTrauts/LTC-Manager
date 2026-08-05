-- Phase 7A: Dietary daily Assignment plan, expanded sources, richer audit, idempotency.

-- Plan lifecycle for a Facility + Department + operational date.
CREATE TYPE "OperationalAssignmentPlanStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'REOPENED', 'CLOSED');

-- Expand Assignment sources (additive; existing values retained).
ALTER TYPE "OperationalAssignmentSource" ADD VALUE IF NOT EXISTS 'SCHEDULED_EMPLOYEE';
ALTER TYPE "OperationalAssignmentSource" ADD VALUE IF NOT EXISTS 'UNSCHEDULED_COVERAGE';
ALTER TYPE "OperationalAssignmentSource" ADD VALUE IF NOT EXISTS 'SUPERVISOR_OVERRIDE';
ALTER TYPE "OperationalAssignmentSource" ADD VALUE IF NOT EXISTS 'CALL_OFF_REPLACEMENT';
ALTER TYPE "OperationalAssignmentSource" ADD VALUE IF NOT EXISTS 'MANUAL_ADDITION';

CREATE TABLE "OperationalAssignmentPlan" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "status" "OperationalAssignmentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "coverageAcknowledgedAt" TIMESTAMP(3),
    "coverageAcknowledgedByUserId" TEXT,
    "lastChangedByUserId" TEXT,
    "lastChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAssignmentPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalAssignmentPlan_facilityId_departmentId_serviceDate_key"
  ON "OperationalAssignmentPlan"("facilityId", "departmentId", "serviceDate");
CREATE INDEX "OperationalAssignmentPlan_facilityId_serviceDate_idx"
  ON "OperationalAssignmentPlan"("facilityId", "serviceDate");
CREATE INDEX "OperationalAssignmentPlan_departmentId_serviceDate_idx"
  ON "OperationalAssignmentPlan"("departmentId", "serviceDate");

ALTER TABLE "OperationalAssignmentPlan"
  ADD CONSTRAINT "OperationalAssignmentPlan_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalAssignmentPlan"
  ADD CONSTRAINT "OperationalAssignmentPlan_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalAssignmentPlan"
  ADD CONSTRAINT "OperationalAssignmentPlan_confirmedByUserId_fkey"
  FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationalAssignmentPlan"
  ADD CONSTRAINT "OperationalAssignmentPlan_reopenedByUserId_fkey"
  FOREIGN KEY ("reopenedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationalAssignmentPlan"
  ADD CONSTRAINT "OperationalAssignmentPlan_closedByUserId_fkey"
  FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationalAssignmentPlan"
  ADD CONSTRAINT "OperationalAssignmentPlan_coverageAcknowledgedByUserId_fkey"
  FOREIGN KEY ("coverageAcknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationalAssignmentPlan"
  ADD CONSTRAINT "OperationalAssignmentPlan_lastChangedByUserId_fkey"
  FOREIGN KEY ("lastChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Link assignments to the daily plan; idempotency key for safe retries.
ALTER TABLE "OperationalAssignment"
  ADD COLUMN "planId" TEXT,
  ADD COLUMN "clientCommandId" TEXT,
  ADD COLUMN "changeReason" TEXT,
  ADD COLUMN "lastChangedByUserId" TEXT,
  ADD COLUMN "lastChangedAt" TIMESTAMP(3);

CREATE INDEX "OperationalAssignment_planId_idx" ON "OperationalAssignment"("planId");
CREATE UNIQUE INDEX "OperationalAssignment_facilityId_clientCommandId_key"
  ON "OperationalAssignment"("facilityId", "clientCommandId");

ALTER TABLE "OperationalAssignment"
  ADD CONSTRAINT "OperationalAssignment_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "OperationalAssignmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationalAssignment"
  ADD CONSTRAINT "OperationalAssignment_lastChangedByUserId_fkey"
  FOREIGN KEY ("lastChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Richer assignment event audit (additive columns).
-- assignmentId is nullable so plan-level events (confirm/reopen/close) can be retained.
ALTER TABLE "OperationalAssignmentEvent"
  ADD COLUMN "planId" TEXT,
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "employeeId" TEXT,
  ADD COLUMN "unitId" TEXT,
  ADD COLUMN "serviceDate" DATE,
  ADD COLUMN "authMethod" TEXT,
  ADD COLUMN "actorRole" TEXT,
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "priorValuesJson" TEXT,
  ADD COLUMN "newValuesJson" TEXT;

ALTER TABLE "OperationalAssignmentEvent"
  ALTER COLUMN "assignmentId" DROP NOT NULL;

CREATE INDEX "OperationalAssignmentEvent_departmentId_createdAt_idx"
  ON "OperationalAssignmentEvent"("departmentId", "createdAt");
CREATE INDEX "OperationalAssignmentEvent_planId_createdAt_idx"
  ON "OperationalAssignmentEvent"("planId", "createdAt");

ALTER TABLE "OperationalAssignmentEvent"
  ADD CONSTRAINT "OperationalAssignmentEvent_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "OperationalAssignmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Template effective dating for coverage requirements (retire rather than delete).
ALTER TABLE "OperationalAssignmentTemplate"
  ADD COLUMN "effectiveFrom" DATE,
  ADD COLUMN "effectiveTo" DATE;

CREATE INDEX "OperationalAssignmentTemplate_facilityId_departmentId_effective_idx"
  ON "OperationalAssignmentTemplate"("facilityId", "departmentId", "effectiveFrom", "effectiveTo");
