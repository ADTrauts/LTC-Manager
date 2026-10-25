-- LEG-05: map legacy work-order statuses onto the current lifecycle.
-- CLOSED becomes COMPLETED. WAITING_PARTS becomes ON_HOLD with a parts reason.
-- A completion note in resolution is copied into workPerformed when that summary is empty.
-- The enum values stay until LEG-06.

UPDATE "Repair"
SET "workPerformed" = "resolution"
WHERE "resolution" IS NOT NULL
  AND btrim("resolution") <> ''
  AND ("workPerformed" IS NULL OR btrim("workPerformed") = '');

UPDATE "Repair"
SET
  "status" = 'COMPLETED',
  "completedAt" = COALESCE("completedAt", "updatedAt")
WHERE "status" = 'CLOSED';

UPDATE "RepairUpdate"
SET "statusAfterUpdate" = 'COMPLETED'
WHERE "statusAfterUpdate" = 'CLOSED';

UPDATE "Repair"
SET
  "status" = 'ON_HOLD',
  "holdReason" = COALESCE("holdReason", 'WAITING_FOR_PART'),
  "completedAt" = NULL
WHERE "status" = 'WAITING_PARTS';

UPDATE "RepairUpdate"
SET "statusAfterUpdate" = 'ON_HOLD'
WHERE "statusAfterUpdate" = 'WAITING_PARTS';
