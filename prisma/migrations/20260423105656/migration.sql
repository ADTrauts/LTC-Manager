-- This migration can run before the table-creation migration in a clean shadow DB.
-- Guard with IF EXISTS so migrate dev does not fail during replay.
ALTER TABLE IF EXISTS "ServeryMealServiceEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;
