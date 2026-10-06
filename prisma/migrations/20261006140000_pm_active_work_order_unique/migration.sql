-- Phase 4B: at most one active Work Order per Preventive Maintenance occurrence.
-- Active = Repair.status not in (COMPLETED, CLOSED, CANCELLED).
-- pmOccurrenceId is not globally unique: canceled Work Orders may be replaced.
--
-- Phase 4A SQL fixtures could insert two OPEN rows on one occurrence. Collapse
-- extras to CANCELLED so this index is deterministic on every database, including
-- disposable verify databases. Production 4A data has no generated PM Work Orders.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "pmOccurrenceId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "Repair"
  WHERE "pmOccurrenceId" IS NOT NULL
    AND "status" NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED')
)
UPDATE "Repair" AS r
SET "status" = 'CANCELLED'
FROM ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX "Repair_pmOccurrenceId_active_key"
ON "Repair" ("pmOccurrenceId")
WHERE "pmOccurrenceId" IS NOT NULL
  AND "status" NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED');
