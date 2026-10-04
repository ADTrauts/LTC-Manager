-- CreateEnum
CREATE TYPE "SupportStaffNotificationType" AS ENUM ('NEW_TICKET', 'ASSIGNED_TO_ME', 'CUSTOMER_REPLIED', 'HIGH_PRIORITY', 'URGENT_PRIORITY', 'DELIVERY_FAILED', 'BOUNCED', 'SPAM_COMPLAINT');

-- CreateEnum
CREATE TYPE "SupportStaffNotificationEmailStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "SupportStaffNotification" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "type" "SupportStaffNotificationType" NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "emailStatus" "SupportStaffNotificationEmailStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "emailSentAt" TIMESTAMP(3),
    "emailError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportStaffNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportStaffNotification_dedupeKey_key" ON "SupportStaffNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "SupportStaffNotification_staffId_isRead_createdAt_idx" ON "SupportStaffNotification"("staffId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "SupportStaffNotification_staffId_createdAt_idx" ON "SupportStaffNotification"("staffId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportStaffNotification_ticketId_idx" ON "SupportStaffNotification"("ticketId");

-- AddForeignKey
ALTER TABLE "SupportStaffNotification" ADD CONSTRAINT "SupportStaffNotification_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportStaffNotification" ADD CONSTRAINT "SupportStaffNotification_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportStaffNotification" ADD CONSTRAINT "SupportStaffNotification_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportTicketMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
