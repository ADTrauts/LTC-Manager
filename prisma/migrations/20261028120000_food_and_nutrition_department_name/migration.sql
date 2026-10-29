-- Stock Food and Nutrition departments were named Dietary.
-- Rename only that default. A facility that already chose another name keeps it.
-- The installation key stays DIETARY.
UPDATE "Department"
SET "name" = 'Food and Nutrition'
WHERE "key" = 'DIETARY'
  AND "name" = 'Dietary';
