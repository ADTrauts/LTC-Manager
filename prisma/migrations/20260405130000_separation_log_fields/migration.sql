-- CreateEnum
CREATE TYPE "SeparationKind" AS ENUM ('RESIGNED', 'TERMINATED');

-- AlterTable
ALTER TABLE "EmployeeTerminationRecord" ADD COLUMN "lastShiftWorkedAt" DATE,
ADD COLUMN "separationKind" "SeparationKind" NOT NULL DEFAULT 'TERMINATED',
ADD COLUMN "wouldRehire" BOOLEAN;
