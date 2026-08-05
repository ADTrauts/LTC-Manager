-- Dietary service milestone integrity.
--
-- Adds three things the previous model could not express:
--   1. Employee attribution and credential surface, so a milestone recorded on a shared tablet
--      through a PIN session has an actor. Previously `readyRecordedById` referenced `User`, which
--      is null for PIN sessions, so exactly the shared-tablet case recorded no actor at all.
--   2. Server acceptance time separate from occurrence time, so a late entry is distinguishable
--      from a late meal.
--   3. `ServeryMilestoneEntry`, an append-only log of every entry and correction, carrying the
--      value each correction replaced.
--
-- Additive only. No column is dropped, no row is deleted, and no existing value is overwritten.
-- Safe on an empty database and on databases holding existing ServeryMealServiceEvent rows.

-- CreateEnum
CREATE TYPE "ServeryMilestone" AS ENUM ('READY', 'SERVICE_STARTED');

-- CreateEnum
CREATE TYPE "ServeryMilestoneEntryKind" AS ENUM ('ORIGINAL', 'CORRECTION');

-- CreateEnum
CREATE TYPE "SessionAuthMethod" AS ENUM ('PASSWORD', 'QUICK_PIN');

-- AlterTable
ALTER TABLE "ServeryMealServiceEvent"
  ADD COLUMN "readyRecordedAt"             TIMESTAMP(3),
  ADD COLUMN "startedRecordedAt"           TIMESTAMP(3),
  ADD COLUMN "readyRecordedByEmployeeId"   TEXT,
  ADD COLUMN "startedRecordedByEmployeeId" TEXT,
  ADD COLUMN "readyAuthMethod"             "SessionAuthMethod",
  ADD COLUMN "startedAuthMethod"           "SessionAuthMethod";

-- CreateTable
CREATE TABLE "ServeryMilestoneEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "milestone" "ServeryMilestone" NOT NULL,
    "kind" "ServeryMilestoneEntryKind" NOT NULL DEFAULT 'ORIGINAL',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousOccurredAt" TIMESTAMP(3),
    "reason" TEXT,
    "actorUserId" TEXT,
    "actorEmployeeId" TEXT,
    "actorRole" "RoleKey",
    "authMethod" "SessionAuthMethod",
    "deviceUnitId" TEXT,
    "clientActionId" TEXT NOT NULL,

    CONSTRAINT "ServeryMilestoneEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServeryMilestoneEntry_eventId_milestone_recordedAt_idx" ON "ServeryMilestoneEntry"("eventId", "milestone", "recordedAt");

-- CreateIndex
CREATE INDEX "ServeryMilestoneEntry_actorUserId_idx" ON "ServeryMilestoneEntry"("actorUserId");

-- CreateIndex
CREATE INDEX "ServeryMilestoneEntry_actorEmployeeId_idx" ON "ServeryMilestoneEntry"("actorEmployeeId");

-- CreateIndex
-- Idempotency. `eventId` already encodes Facility (through Unit), Unit, service date, and meal, so
-- scoping the key by (eventId, milestone) prevents a replayed command from creating a second effect
-- and prevents a reused client id from colliding across contexts.
CREATE UNIQUE INDEX "ServeryMilestoneEntry_eventId_milestone_clientActionId_key" ON "ServeryMilestoneEntry"("eventId", "milestone", "clientActionId");

-- AddForeignKey
ALTER TABLE "ServeryMealServiceEvent" ADD CONSTRAINT "ServeryMealServiceEvent_readyRecordedByEmployeeId_fkey" FOREIGN KEY ("readyRecordedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServeryMealServiceEvent" ADD CONSTRAINT "ServeryMealServiceEvent_startedRecordedByEmployeeId_fkey" FOREIGN KEY ("startedRecordedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServeryMilestoneEntry" ADD CONSTRAINT "ServeryMilestoneEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ServeryMealServiceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServeryMilestoneEntry" ADD CONSTRAINT "ServeryMilestoneEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServeryMilestoneEntry" ADD CONSTRAINT "ServeryMilestoneEntry_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: give every milestone already recorded an ORIGINAL entry so the append-only log is
-- complete from the first day it exists, and history readers do not show a gap before this release.
--
-- Deterministic: ids and idempotency keys are derived from the event id, so re-running produces the
-- same rows and the unique index makes a second run a no-op. `occurredAt` is the recorded
-- occurrence. `recordedAt` uses `updatedAt`, the closest server time the old model retained.
--
-- `actorRole`, `authMethod`, and the event's new `*RecordedAt` columns are deliberately left null
-- for these rows: that information was never captured, and inferring it would fabricate audit data.
INSERT INTO "ServeryMilestoneEntry" (
  "id", "eventId", "milestone", "kind", "occurredAt", "recordedAt",
  "actorUserId", "actorRole", "authMethod", "clientActionId"
)
SELECT
  'bf_' || "id" || '_ready',
  "id",
  'READY'::"ServeryMilestone",
  'ORIGINAL'::"ServeryMilestoneEntryKind",
  "mealServiceReadyAt",
  "updatedAt",
  "readyRecordedById",
  NULL,
  NULL,
  'backfill:' || "id" || ':READY'
FROM "ServeryMealServiceEvent"
WHERE "mealServiceReadyAt" IS NOT NULL
ON CONFLICT ("eventId", "milestone", "clientActionId") DO NOTHING;

INSERT INTO "ServeryMilestoneEntry" (
  "id", "eventId", "milestone", "kind", "occurredAt", "recordedAt",
  "actorUserId", "actorRole", "authMethod", "clientActionId"
)
SELECT
  'bf_' || "id" || '_started',
  "id",
  'SERVICE_STARTED'::"ServeryMilestone",
  'ORIGINAL'::"ServeryMilestoneEntryKind",
  "mealServiceStartedAt",
  "updatedAt",
  "startedRecordedById",
  NULL,
  NULL,
  'backfill:' || "id" || ':SERVICE_STARTED'
FROM "ServeryMealServiceEvent"
WHERE "mealServiceStartedAt" IS NOT NULL
ON CONFLICT ("eventId", "milestone", "clientActionId") DO NOTHING;
