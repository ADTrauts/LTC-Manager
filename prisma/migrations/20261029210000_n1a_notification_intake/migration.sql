-- N1A: Notifications & Attention intake records.
-- Additive. Does not change Coverage, Readiness, Asset, Repair, or Harbor support notices.

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('OPERATIONAL', 'COMMUNICATION', 'SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('UPDATE', 'NEEDS_ATTENTION', 'URGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationRecipientReason" AS ENUM ('CURRENT_ASSIGNEE', 'ON_DUTY_SUPERVISOR', 'DEPARTMENT_MANAGER', 'ASSET_OWNER', 'WORK_ORDER_ASSIGNEE', 'ON_CALL_RESPONDER', 'ESCALATION_TARGET', 'FACILITY_ADMIN');

-- CreateEnum
CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('IN_APP', 'WEB_PUSH', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "kind" "NotificationKind" NOT NULL,
    "category" TEXT NOT NULL,
    "priority" "NotificationPriority" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionPath" TEXT,
    "groupKey" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "policyVersion" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "NotificationRecipientReason" NOT NULL,
    "explanation" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationRecipientId" TEXT NOT NULL,
    "channel" "NotificationDeliveryChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "lastError" TEXT,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationOutbox_processedAt_createdAt_idx" ON "NotificationOutbox"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_departmentId_idx" ON "NotificationOutbox"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_facilityId_dedupeKey_key" ON "NotificationOutbox"("facilityId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_facilityId_resolvedAt_idx" ON "Notification"("facilityId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Notification_facilityId_sourceType_sourceId_idx" ON "Notification"("facilityId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Notification_departmentId_idx" ON "Notification"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_facilityId_dedupeKey_key" ON "Notification"("facilityId", "dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_createdAt_idx" ON "NotificationRecipient"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_readAt_idx" ON "NotificationRecipient"("userId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_acknowledgedAt_idx" ON "NotificationRecipient"("userId", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_snoozedUntil_idx" ON "NotificationRecipient"("userId", "snoozedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_notificationId_userId_reason_key" ON "NotificationRecipient"("notificationId", "userId", "reason");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_queuedAt_idx" ON "NotificationDelivery"("status", "queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationRecipientId_channel_key" ON "NotificationDelivery"("notificationRecipientId", "channel");

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationRecipientId_fkey" FOREIGN KEY ("notificationRecipientId") REFERENCES "NotificationRecipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
