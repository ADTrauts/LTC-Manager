-- CreateEnum
CREATE TYPE "IssueType" AS ENUM (
  'EQUIPMENT',
  'SUPPLY_SHORT',
  'ENVIRONMENT',
  'SAFETY',
  'SERVICE_DISRUPTION',
  'OTHER'
);

-- AlterTable
ALTER TABLE "Repair"
ADD COLUMN "issueType" "IssueType" NOT NULL DEFAULT 'EQUIPMENT';

-- CreateIndex
CREATE INDEX "Repair_issueType_status_idx" ON "Repair"("issueType", "status");
