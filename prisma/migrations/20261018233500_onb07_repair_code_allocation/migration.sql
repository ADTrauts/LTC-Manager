-- Forward-only repair identifier allocation. Count/check/insert is not atomic.
-- Preserve existing R-00001 formatting and initialize above historical values.
-- Sequences deliberately retain gaps after rolled-back work; codes are never reused.
CREATE SEQUENCE "RepairCodeSequence" AS bigint MINVALUE 1;
SELECT setval('"RepairCodeSequence"',
  GREATEST(COALESCE((SELECT MAX(substring("repairCode" FROM '^R-([0-9]+)$')::bigint) FROM "Repair"), 0) + 1, 1),
  false);
