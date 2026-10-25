-- LEG-05: existing assets recorded as ACTIVE are OPERATIONAL.
-- The enum value stays until LEG-06.

UPDATE "Asset"
SET "status" = 'OPERATIONAL'
WHERE "status" = 'ACTIVE';

UPDATE "AssetStatusHistory"
SET "fromStatus" = 'OPERATIONAL'
WHERE "fromStatus" = 'ACTIVE';

UPDATE "AssetStatusHistory"
SET "toStatus" = 'OPERATIONAL'
WHERE "toStatus" = 'ACTIVE';
