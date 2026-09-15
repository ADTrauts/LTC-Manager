-- Build model correction: Facility Room Types + Operational Cycle Key Times.
-- Additive only. Legacy SpaceType / customTypeLabel / milestone / ROOM_TYPE scope preserved.

-- ---------------------------------------------------------------------------
-- OperationalCycleNodeKind
-- ---------------------------------------------------------------------------
CREATE TYPE "OperationalCycleNodeKind" AS ENUM ('PERIOD', 'KEY_TIME');

-- ---------------------------------------------------------------------------
-- FacilityRoomType
-- ---------------------------------------------------------------------------
CREATE TABLE "FacilityRoomType" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "baseTypeKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityRoomType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacilityRoomType_facilityId_displayName_key"
  ON "FacilityRoomType"("facilityId", "displayName");

CREATE INDEX "FacilityRoomType_facilityId_isActive_displayOrder_idx"
  ON "FacilityRoomType"("facilityId", "isActive", "displayOrder");

CREATE INDEX "FacilityRoomType_facilityId_baseTypeKey_idx"
  ON "FacilityRoomType"("facilityId", "baseTypeKey");

ALTER TABLE "FacilityRoomType"
  ADD CONSTRAINT "FacilityRoomType_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- UnitSpace.facilityRoomTypeId
-- ---------------------------------------------------------------------------
ALTER TABLE "UnitSpace"
  ADD COLUMN "facilityRoomTypeId" TEXT;

CREATE INDEX "UnitSpace_facilityRoomTypeId_idx"
  ON "UnitSpace"("facilityRoomTypeId");

ALTER TABLE "UnitSpace"
  ADD CONSTRAINT "UnitSpace_facilityRoomTypeId_fkey"
  FOREIGN KEY ("facilityRoomTypeId") REFERENCES "FacilityRoomType"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- DepartmentOperationalCycle: node kind, inherit locations, nullable windows
-- ---------------------------------------------------------------------------
ALTER TABLE "DepartmentOperationalCycle"
  ADD COLUMN "nodeKind" "OperationalCycleNodeKind" NOT NULL DEFAULT 'PERIOD',
  ADD COLUMN "locationInheritFromParent" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "DepartmentOperationalCycle"
  ALTER COLUMN "startLocal" DROP NOT NULL,
  ALTER COLUMN "endLocal" DROP NOT NULL;

CREATE INDEX "DepartmentOperationalCycle_departmentId_nodeKind_idx"
  ON "DepartmentOperationalCycle"("departmentId", "nodeKind");

-- ---------------------------------------------------------------------------
-- Key Time groups
-- ---------------------------------------------------------------------------
CREATE TABLE "DepartmentOperationalCycleKeyTimeGroup" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "dueLocal" TEXT NOT NULL,
    "displaySequence" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentOperationalCycleKeyTimeGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentOperationalCycleKeyTimeGroup_cycleId_dueLocal_key"
  ON "DepartmentOperationalCycleKeyTimeGroup"("cycleId", "dueLocal");

CREATE INDEX "DepartmentOperationalCycleKeyTimeGroup_cycleId_displaySequence_idx"
  ON "DepartmentOperationalCycleKeyTimeGroup"("cycleId", "displaySequence");

ALTER TABLE "DepartmentOperationalCycleKeyTimeGroup"
  ADD CONSTRAINT "DepartmentOperationalCycleKeyTimeGroup_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DepartmentOperationalCycleKeyTimeGroupRoom" (
    "id" TEXT NOT NULL,
    "keyTimeGroupId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentOperationalCycleKeyTimeGroupRoom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentOperationalCycleKeyTimeGroupRoom_keyTimeGroupId_spaceId_key"
  ON "DepartmentOperationalCycleKeyTimeGroupRoom"("keyTimeGroupId", "spaceId");

CREATE UNIQUE INDEX "DepartmentOperationalCycleKeyTimeGroupRoom_cycleId_spaceId_key"
  ON "DepartmentOperationalCycleKeyTimeGroupRoom"("cycleId", "spaceId");

CREATE INDEX "DepartmentOperationalCycleKeyTimeGroupRoom_spaceId_idx"
  ON "DepartmentOperationalCycleKeyTimeGroupRoom"("spaceId");

CREATE INDEX "DepartmentOperationalCycleKeyTimeGroupRoom_cycleId_idx"
  ON "DepartmentOperationalCycleKeyTimeGroupRoom"("cycleId");

ALTER TABLE "DepartmentOperationalCycleKeyTimeGroupRoom"
  ADD CONSTRAINT "DepartmentOperationalCycleKeyTimeGroupRoom_keyTimeGroupId_fkey"
  FOREIGN KEY ("keyTimeGroupId") REFERENCES "DepartmentOperationalCycleKeyTimeGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentOperationalCycleKeyTimeGroupRoom"
  ADD CONSTRAINT "DepartmentOperationalCycleKeyTimeGroupRoom_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
