-- One Web Push attempt for one browser subscription.
-- Deleting the recipient or the subscription deletes the attempt.
-- No backfill. Rows are not created while WEB_PUSH_SENDING_ENABLED is off.

CREATE TYPE "PushDispatchStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SUPPRESSED');

CREATE TABLE "PushDispatch" (
    "id" TEXT NOT NULL,
    "notificationRecipientId" TEXT NOT NULL,
    "pushSubscriptionId" TEXT NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "status" "PushDispatchStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDispatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushDispatch_pushSubscriptionId_triggerKey_key" ON "PushDispatch"("pushSubscriptionId", "triggerKey");

CREATE INDEX "PushDispatch_status_expiresAt_idx" ON "PushDispatch"("status", "expiresAt");

CREATE INDEX "PushDispatch_notificationRecipientId_idx" ON "PushDispatch"("notificationRecipientId");

ALTER TABLE "PushDispatch" ADD CONSTRAINT "PushDispatch_notificationRecipientId_fkey" FOREIGN KEY ("notificationRecipientId") REFERENCES "NotificationRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushDispatch" ADD CONSTRAINT "PushDispatch_pushSubscriptionId_fkey" FOREIGN KEY ("pushSubscriptionId") REFERENCES "PushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
