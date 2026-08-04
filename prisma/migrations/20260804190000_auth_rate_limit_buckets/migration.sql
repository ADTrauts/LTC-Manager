-- Durable, cross-process authentication throttling for password and Quick PIN login.
-- Rows store only keyed hashes of the throttled identity, never a credential value.

-- CreateEnum
CREATE TYPE "AuthRateLimitBucketType" AS ENUM ('PASSWORD_ACCOUNT', 'PIN_CANDIDATE', 'PIN_FACILITY');

-- CreateTable
CREATE TABLE "AuthRateLimitBucket" (
    "id" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "bucketType" "AuthRateLimitBucketType" NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthRateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Unique so `INSERT ... ON CONFLICT ("bucketKey") DO UPDATE` can increment atomically.
CREATE UNIQUE INDEX "AuthRateLimitBucket_bucketKey_key" ON "AuthRateLimitBucket"("bucketKey");

-- CreateIndex
CREATE INDEX "AuthRateLimitBucket_bucketType_lockedUntil_idx" ON "AuthRateLimitBucket"("bucketType", "lockedUntil");

-- CreateIndex
CREATE INDEX "AuthRateLimitBucket_lastAttemptAt_idx" ON "AuthRateLimitBucket"("lastAttemptAt");
