-- Rooms may nest one level under another room (e.g. bathroom inside a resident room).
-- Nested rooms keep unitId of the neighborhood; parentSpaceId records physical containment.
-- Deleting a parent un-nests children rather than deleting them.

ALTER TABLE "UnitSpace" ADD COLUMN "parentSpaceId" TEXT;

ALTER TABLE "UnitSpace" ADD CONSTRAINT "UnitSpace_parentSpaceId_fkey"
  FOREIGN KEY ("parentSpaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "UnitSpace_parentSpaceId_idx" ON "UnitSpace"("parentSpaceId");
