-- AlterTable
ALTER TABLE "Facility"
ADD COLUMN "billingEmail" TEXT,
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN "onboardingCurrentStep" TEXT,
ADD COLUMN "onboardingStartedAt" TIMESTAMP(3),
ADD COLUMN "stripeCustomerId" TEXT,
ADD COLUMN "stripeDefaultPaymentMethodId" TEXT;

-- CreateTable
CREATE TABLE "OnboardingManagerInvite" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingManagerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingManagerInvite_facilityId_email_key" ON "OnboardingManagerInvite"("facilityId", "email");

-- CreateIndex
CREATE INDEX "OnboardingManagerInvite_facilityId_createdAt_idx" ON "OnboardingManagerInvite"("facilityId", "createdAt");

-- AddForeignKey
ALTER TABLE "OnboardingManagerInvite" ADD CONSTRAINT "OnboardingManagerInvite_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
