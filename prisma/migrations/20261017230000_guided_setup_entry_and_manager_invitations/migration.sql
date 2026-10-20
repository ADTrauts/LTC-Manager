-- Add journey confirmation and turn future manager notices into attributable,
-- expiring invitations. Historical notices/timestamps and grants are untouched.
ALTER TABLE "Facility" ADD COLUMN "onboardingEntryConfirmedAt" TIMESTAMP(3);
ALTER TABLE "OnboardingManagerInvite"
 ADD COLUMN "tokenHash" TEXT,
 ADD COLUMN "expiresAt" TIMESTAMP(3),
 ADD COLUMN "invitedByUserId" TEXT,
 ADD COLUMN "acceptedByUserId" TEXT,
 ADD COLUMN "grantAcceptedAt" TIMESTAMP(3),
 ADD COLUMN "lastDeliveryAt" TIMESTAMP(3),
 ADD COLUMN "deliveryStatus" TEXT;
CREATE UNIQUE INDEX "OnboardingManagerInvite_tokenHash_key" ON "OnboardingManagerInvite"("tokenHash");
ALTER TABLE "OnboardingManagerInvite" ADD CONSTRAINT "OnboardingManagerInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnboardingManagerInvite" ADD CONSTRAINT "OnboardingManagerInvite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
