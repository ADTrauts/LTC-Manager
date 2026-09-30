-- AlterEnum
ALTER TYPE "HarborAuditAction" ADD VALUE 'TICKET_OPEN';
ALTER TYPE "HarborAuditAction" ADD VALUE 'TICKET_REPLY';

-- CreateEnum
CREATE TYPE "ConsoleTicketStatus" AS ENUM ('OPEN', 'WAITING_ON_CUSTOMER', 'RESOLVED');

-- CreateTable
CREATE TABLE "ConsoleTicket" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "ConsoleTicketStatus" NOT NULL DEFAULT 'OPEN',
    "requesterEmail" TEXT NOT NULL,
    "requesterName" TEXT,
    "openedByStaffId" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsoleTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsoleTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorStaffId" TEXT NOT NULL,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsoleTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsoleTicket_facilityId_status_updatedAt_idx" ON "ConsoleTicket"("facilityId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ConsoleTicket_status_updatedAt_idx" ON "ConsoleTicket"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ConsoleTicketMessage_ticketId_createdAt_idx" ON "ConsoleTicketMessage"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConsoleTicket" ADD CONSTRAINT "ConsoleTicket_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsoleTicket" ADD CONSTRAINT "ConsoleTicket_openedByStaffId_fkey" FOREIGN KEY ("openedByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsoleTicketMessage" ADD CONSTRAINT "ConsoleTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ConsoleTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsoleTicketMessage" ADD CONSTRAINT "ConsoleTicketMessage_authorStaffId_fkey" FOREIGN KEY ("authorStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
