-- Setup can name a Department head and invite them in one step.
-- Acceptance assigns the head. Older invitations stay department-free.

ALTER TABLE "OnboardingManagerInvite" ADD COLUMN "departmentId" TEXT,
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT;

ALTER TABLE "OnboardingManagerInvite" ADD CONSTRAINT "OnboardingManagerInvite_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OnboardingManagerInvite_departmentId_idx" ON "OnboardingManagerInvite"("departmentId");
