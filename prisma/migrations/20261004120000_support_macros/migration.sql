-- CreateEnum
CREATE TYPE "SupportMacroAssignmentMode" AS ENUM ('UNCHANGED', 'ME', 'STAFF', 'UNASSIGN');

-- CreateTable
CREATE TABLE "SupportMacro" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "savedReplyId" TEXT,
    "status" "SupportTicketStatus",
    "statusAfterReply" "SupportTicketStatus",
    "type" "SupportTicketType",
    "priority" "SupportTicketPriority",
    "assignmentMode" "SupportMacroAssignmentMode" NOT NULL DEFAULT 'UNCHANGED',
    "assignedStaffId" TEXT,
    "createdByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportMacro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMacroTag" (
    "macroId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "SupportMacroTag_pkey" PRIMARY KEY ("macroId","tagId")
);

-- CreateTable
CREATE TABLE "SupportMacroApplication" (
    "id" TEXT NOT NULL,
    "macroId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "appliedByStaffId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "macroName" TEXT NOT NULL,

    CONSTRAINT "SupportMacroApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportMacro_isActive_name_idx" ON "SupportMacro"("isActive", "name");

-- CreateIndex
CREATE INDEX "SupportMacro_savedReplyId_idx" ON "SupportMacro"("savedReplyId");

-- CreateIndex
CREATE INDEX "SupportMacroTag_tagId_idx" ON "SupportMacroTag"("tagId");

-- CreateIndex
CREATE INDEX "SupportMacroApplication_ticketId_appliedAt_idx" ON "SupportMacroApplication"("ticketId", "appliedAt");

-- CreateIndex
CREATE INDEX "SupportMacroApplication_macroId_appliedAt_idx" ON "SupportMacroApplication"("macroId", "appliedAt");

-- AddForeignKey
ALTER TABLE "SupportMacro" ADD CONSTRAINT "SupportMacro_savedReplyId_fkey" FOREIGN KEY ("savedReplyId") REFERENCES "SupportSavedReply"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacro" ADD CONSTRAINT "SupportMacro_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacro" ADD CONSTRAINT "SupportMacro_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacroTag" ADD CONSTRAINT "SupportMacroTag_macroId_fkey" FOREIGN KEY ("macroId") REFERENCES "SupportMacro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacroTag" ADD CONSTRAINT "SupportMacroTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "SupportTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacroApplication" ADD CONSTRAINT "SupportMacroApplication_macroId_fkey" FOREIGN KEY ("macroId") REFERENCES "SupportMacro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacroApplication" ADD CONSTRAINT "SupportMacroApplication_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacroApplication" ADD CONSTRAINT "SupportMacroApplication_appliedByStaffId_fkey" FOREIGN KEY ("appliedByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
