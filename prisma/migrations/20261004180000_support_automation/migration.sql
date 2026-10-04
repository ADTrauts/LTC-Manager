-- AlterEnum
ALTER TYPE "SupportStaffNotificationType" ADD VALUE IF NOT EXISTS 'UNASSIGNED_ALERT';
ALTER TYPE "SupportTicketEventType" ADD VALUE IF NOT EXISTS 'AUTOMATION_APPLIED';

-- CreateEnum
CREATE TYPE "SupportAutomationType" AS ENUM ('WAITING_REMINDER', 'WAITING_RESOLVE', 'RESOLVED_CLOSE', 'UNASSIGNED_ALERT');
CREATE TYPE "SupportAutomationAction" AS ENUM ('SEND_REMINDER', 'RESOLVE_AFTER_WAIT', 'CLOSE_RESOLVED', 'ALERT_UNASSIGNED');
CREATE TYPE "SupportAutomationRunOutcome" AS ENUM ('CLAIMED', 'APPLIED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "SupportAutomationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SupportAutomationType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "delayMinutes" INTEGER NOT NULL,
    "savedReplyId" TEXT,
    "createdByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportAutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportAutomationRun" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "action" "SupportAutomationAction" NOT NULL,
    "outcome" "SupportAutomationRunOutcome" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "reason" TEXT,
    "messageId" TEXT,
    "eventId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportAutomationRun_dedupeKey_key" ON "SupportAutomationRun"("dedupeKey");
CREATE INDEX "SupportAutomationRule_isActive_type_idx" ON "SupportAutomationRule"("isActive", "type");
CREATE INDEX "SupportAutomationRule_savedReplyId_idx" ON "SupportAutomationRule"("savedReplyId");
CREATE INDEX "SupportAutomationRun_ruleId_occurredAt_idx" ON "SupportAutomationRun"("ruleId", "occurredAt");
CREATE INDEX "SupportAutomationRun_ticketId_occurredAt_idx" ON "SupportAutomationRun"("ticketId", "occurredAt");

ALTER TABLE "SupportAutomationRule" ADD CONSTRAINT "SupportAutomationRule_savedReplyId_fkey" FOREIGN KEY ("savedReplyId") REFERENCES "SupportSavedReply"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportAutomationRule" ADD CONSTRAINT "SupportAutomationRule_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportAutomationRun" ADD CONSTRAINT "SupportAutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "SupportAutomationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportAutomationRun" ADD CONSTRAINT "SupportAutomationRun_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
