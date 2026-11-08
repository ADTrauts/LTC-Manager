-- V1 acknowledgement escalation timing.
-- Nullable so existing threads are not escalated on deploy.
-- No backfill. A later notify sets the deadline from Notification.createdAt.

ALTER TABLE "Notification" ADD COLUMN "escalationDueAt" TIMESTAMP(3),
ADD COLUMN "escalatedAt" TIMESTAMP(3),
ADD COLUMN "escalationPolicyVersion" TEXT;

CREATE INDEX "Notification_facilityId_escalationDueAt_idx" ON "Notification"("facilityId", "escalationDueAt");
