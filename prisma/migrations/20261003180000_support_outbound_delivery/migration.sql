-- AlterEnum
ALTER TYPE "SupportMessageDeliveryStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "SupportMessageDeliveryStatus" ADD VALUE 'BOUNCED';
ALTER TYPE "SupportMessageDeliveryStatus" ADD VALUE 'SPAM_COMPLAINT';

-- AlterEnum
ALTER TYPE "SupportTicketEventType" ADD VALUE 'EMAIL_BOUNCED';
ALTER TYPE "SupportTicketEventType" ADD VALUE 'EMAIL_COMPLAINT';

-- AlterTable
ALTER TABLE "SupportTicketMessage" ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "bouncedAt" TIMESTAMP(3),
ADD COLUMN "complainedAt" TIMESTAMP(3),
ADD COLUMN "lastDeliveryEventAt" TIMESTAMP(3),
ADD COLUMN "bounceType" TEXT,
ADD COLUMN "bounceCode" TEXT,
ADD COLUMN "bounceDescription" TEXT,
ADD COLUMN "complaintType" TEXT;
