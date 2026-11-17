-- CreateEnum
CREATE TYPE "HarborStaffIntentKind" AS ENUM ('INVITE', 'RECOVERY', 'BOOTSTRAP', 'OWNER_CHANGE');

-- CreateEnum
CREATE TYPE "HarborStaffChallengeKind" AS ENUM ('SIGN_IN', 'STAFF_ACTION', 'ENROLL', 'RECOVERY_FACTOR');

-- CreateTable
CREATE TABLE "HarborStaffRosterEntry" (
    "email" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HarborStaffRosterEntry_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "HarborStaffPasskey" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HarborStaffPasskey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarborStaffLifecycleIntent" (
    "id" TEXT NOT NULL,
    "kind" "HarborStaffIntentKind" NOT NULL,
    "email" TEXT NOT NULL,
    "staffId" TEXT,
    "staffVersion" INTEGER,
    "tokenHash" TEXT,
    "requestedById" TEXT,
    "requestedByVersion" INTEGER,
    "approvedById" TEXT,
    "approvedByVersion" INTEGER,
    "proofReference" TEXT,
    "changeReason" TEXT,
    "selfVerifiedAt" TIMESTAMP(3),
    "desiredRole" "PlatformStaffRole",
    "desiredActive" BOOLEAN,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HarborStaffLifecycleIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarborStaffLifecycleChallenge" (
    "id" TEXT NOT NULL,
    "kind" "HarborStaffChallengeKind" NOT NULL,
    "staffId" TEXT,
    "staffVersion" INTEGER,
    "loginKey" TEXT,
    "intentId" TEXT,
    "action" JSONB,
    "challenge" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HarborStaffLifecycleChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarborStaffLifecycleAudit" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "subject" TEXT NOT NULL,
    "intentId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HarborStaffLifecycleAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HarborStaffPasskey_staffId_idx" ON "HarborStaffPasskey"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "HarborStaffLifecycleIntent_tokenHash_key" ON "HarborStaffLifecycleIntent"("tokenHash");

-- CreateIndex
CREATE INDEX "HarborStaffLifecycleIntent_email_kind_expiresAt_idx" ON "HarborStaffLifecycleIntent"("email", "kind", "expiresAt");

-- CreateIndex
CREATE INDEX "HarborStaffLifecycleChallenge_expiresAt_idx" ON "HarborStaffLifecycleChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "HarborStaffLifecycleAudit_subject_createdAt_idx" ON "HarborStaffLifecycleAudit"("subject", "createdAt");

-- AddForeignKey
ALTER TABLE "HarborStaffPasskey" ADD CONSTRAINT "HarborStaffPasskey_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "PlatformStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
