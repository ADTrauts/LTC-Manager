-- Union discipline tracking is implied by union membership; single flag only.
ALTER TABLE "Employee" DROP COLUMN IF EXISTS "unionDisciplineTracking";
