-- Work Order response requirement.
-- Queue priority stays Repair.priority. Existing rows are STANDARD and have no episode.

CREATE TYPE "WorkOrderResponseRequirement" AS ENUM (
  'STANDARD',
  'IMMEDIATE'
);

CREATE TYPE "WorkOrderResponseTransition" AS ENUM (
  'OPENED',
  'CLEARED',
  'COMPLETED',
  'CANCELLED'
);

ALTER TABLE "Repair"
ADD COLUMN "responseRequirement" "WorkOrderResponseRequirement" NOT NULL DEFAULT 'STANDARD';

CREATE TABLE "WorkOrderResponseHistory" (
  "id" TEXT NOT NULL,
  "repairId" TEXT NOT NULL,
  "fromRequirement" "WorkOrderResponseRequirement",
  "toRequirement" "WorkOrderResponseRequirement" NOT NULL,
  "transition" "WorkOrderResponseTransition" NOT NULL,
  "changedByUserId" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkOrderResponseHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkOrderResponseHistory_repairId_changedAt_idx"
ON "WorkOrderResponseHistory"("repairId", "changedAt");

CREATE INDEX "WorkOrderResponseHistory_changedByUserId_idx"
ON "WorkOrderResponseHistory"("changedByUserId");

ALTER TABLE "WorkOrderResponseHistory"
ADD CONSTRAINT "WorkOrderResponseHistory_repairId_fkey"
FOREIGN KEY ("repairId") REFERENCES "Repair"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkOrderResponseHistory"
ADD CONSTRAINT "WorkOrderResponseHistory_changedByUserId_fkey"
FOREIGN KEY ("changedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
