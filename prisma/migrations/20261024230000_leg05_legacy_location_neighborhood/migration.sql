-- LEG-05: a legacy location is a neighborhood. The enum value stays until LEG-06.

UPDATE "Unit"
SET "hierarchyRole" = 'NEIGHBORHOOD'
WHERE "hierarchyRole" = 'LEGACY_LOCATION';
