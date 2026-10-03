-- CreateEnum
CREATE TYPE "SupportAttachmentScanStatus" AS ENUM ('PENDING', 'CLEAN', 'BLOCKED', 'SCAN_FAILED');

-- CreateEnum
CREATE TYPE "SupportAttachmentRejectionReason" AS ENUM ('OVERSIZE', 'INVALID_BASE64', 'BLOCKED_TYPE', 'STORAGE_UNAVAILABLE', 'STORAGE_FAILED');

-- CreateTable
CREATE TABLE "SupportTicketAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT,
    "checksumSha256" TEXT,
    "contentId" TEXT,
    "scanStatus" "SupportAttachmentScanStatus" NOT NULL,
    "rejectionReason" "SupportAttachmentRejectionReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicketAttachment_messageId_position_key" ON "SupportTicketAttachment"("messageId", "position");

-- CreateIndex
CREATE INDEX "SupportTicketAttachment_messageId_idx" ON "SupportTicketAttachment"("messageId");

-- AddForeignKey
ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportTicketMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
