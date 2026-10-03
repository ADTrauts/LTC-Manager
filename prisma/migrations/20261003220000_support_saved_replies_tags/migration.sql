-- CreateTable
CREATE TABLE "SupportSavedReply" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportSavedReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketTag" (
    "ticketId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "addedByStaffId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketTag_pkey" PRIMARY KEY ("ticketId","tagId")
);

-- CreateIndex
CREATE INDEX "SupportSavedReply_isActive_name_idx" ON "SupportSavedReply"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTag_normalizedName_key" ON "SupportTag"("normalizedName");

-- CreateIndex
CREATE INDEX "SupportTag_isActive_name_idx" ON "SupportTag"("isActive", "name");

-- CreateIndex
CREATE INDEX "SupportTicketTag_tagId_ticketId_idx" ON "SupportTicketTag"("tagId", "ticketId");

-- AddForeignKey
ALTER TABLE "SupportSavedReply" ADD CONSTRAINT "SupportSavedReply_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketTag" ADD CONSTRAINT "SupportTicketTag_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketTag" ADD CONSTRAINT "SupportTicketTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "SupportTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketTag" ADD CONSTRAINT "SupportTicketTag_addedByStaffId_fkey" FOREIGN KEY ("addedByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
