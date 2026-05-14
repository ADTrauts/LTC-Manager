-- Termination + CHRC offboarding (see memory-bank/employee-hr-source-of-truth.md §5.3)
ALTER TABLE "Employee" ADD COLUMN "terminationDate" DATE;
ALTER TABLE "Employee" ADD COLUMN "chrcOffboardingCompletedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "chrcOffboardingNotes" TEXT;
