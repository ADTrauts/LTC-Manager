-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AccountInviteToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountInviteToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountInviteToken_tokenHash_key" ON "AccountInviteToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountInviteToken_userId_usedAt_expiresAt_idx" ON "AccountInviteToken"("userId", "usedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "AccountInviteToken" ADD CONSTRAINT "AccountInviteToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
