-- Phase 11C: EVS Assignment Room/Space scope + Department operational Zones.
-- Additive only. Preserves Dietary Unit Assignments (zero location rows).
-- Safe on empty DB and existing data. Does not write ltc_manager.
-- Does not activate OPERATION_ENGINE_ENABLED or TASK_SYNC_ENABLED.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "DepartmentOperationalZoneStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- ---------------------------------------------------------------------------
-- DepartmentOperationalZone
-- ---------------------------------------------------------------------------

CREATE TABLE "DepartmentOperationalZone" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "DepartmentOperationalZoneStatus" NOT NULL DEFAULT 'DRAFT',
  "retiredAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "lastChangedByUserId" TEXT,
  "lastChangedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DepartmentOperationalZone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentOperationalZone_facilityId_departmentId_name_key"
  ON "DepartmentOperationalZone"("facilityId", "departmentId", "name");

CREATE INDEX "DepartmentOperationalZone_facilityId_departmentId_status_idx"
  ON "DepartmentOperationalZone"("facilityId", "departmentId", "status");

CREATE INDEX "DepartmentOperationalZone_departmentId_status_idx"
  ON "DepartmentOperationalZone"("departmentId", "status");

ALTER TABLE "DepartmentOperationalZone"
  ADD CONSTRAINT "DepartmentOperationalZone_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentOperationalZone"
  ADD CONSTRAINT "DepartmentOperationalZone_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentOperationalZone"
  ADD CONSTRAINT "DepartmentOperationalZone_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DepartmentOperationalZone"
  ADD CONSTRAINT "DepartmentOperationalZone_lastChangedByUserId_fkey"
  FOREIGN KEY ("lastChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- DepartmentOperationalZoneLocation
-- ---------------------------------------------------------------------------

CREATE TABLE "DepartmentOperationalZoneLocation" (
  "id" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "unitSpaceId" TEXT NOT NULL,
  "unitId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DepartmentOperationalZoneLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentOperationalZoneLocation_zoneId_unitSpaceId_key"
  ON "DepartmentOperationalZoneLocation"("zoneId", "unitSpaceId");

CREATE INDEX "DepartmentOperationalZoneLocation_unitSpaceId_idx"
  ON "DepartmentOperationalZoneLocation"("unitSpaceId");

CREATE INDEX "DepartmentOperationalZoneLocation_unitId_idx"
  ON "DepartmentOperationalZoneLocation"("unitId");

CREATE INDEX "DepartmentOperationalZoneLocation_zoneId_sortOrder_idx"
  ON "DepartmentOperationalZoneLocation"("zoneId", "sortOrder");

ALTER TABLE "DepartmentOperationalZoneLocation"
  ADD CONSTRAINT "DepartmentOperationalZoneLocation_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "DepartmentOperationalZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentOperationalZoneLocation"
  ADD CONSTRAINT "DepartmentOperationalZoneLocation_unitSpaceId_fkey"
  FOREIGN KEY ("unitSpaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- OperationalAssignment.sourceZoneId (optional convenience audit)
-- ---------------------------------------------------------------------------

ALTER TABLE "OperationalAssignment"
  ADD COLUMN "sourceZoneId" TEXT;

CREATE INDEX "OperationalAssignment_sourceZoneId_idx"
  ON "OperationalAssignment"("sourceZoneId");

ALTER TABLE "OperationalAssignment"
  ADD CONSTRAINT "OperationalAssignment_sourceZoneId_fkey"
  FOREIGN KEY ("sourceZoneId") REFERENCES "DepartmentOperationalZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- OperationalAssignmentLocation (snapshotted Room/Space responsibility)
-- ---------------------------------------------------------------------------

CREATE TABLE "OperationalAssignmentLocation" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "unitSpaceId" TEXT NOT NULL,
  "unitId" TEXT,
  "labelSnapshot" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperationalAssignmentLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalAssignmentLocation_assignmentId_unitSpaceId_key"
  ON "OperationalAssignmentLocation"("assignmentId", "unitSpaceId");

CREATE INDEX "OperationalAssignmentLocation_unitSpaceId_idx"
  ON "OperationalAssignmentLocation"("unitSpaceId");

CREATE INDEX "OperationalAssignmentLocation_unitId_idx"
  ON "OperationalAssignmentLocation"("unitId");

CREATE INDEX "OperationalAssignmentLocation_assignmentId_sortOrder_idx"
  ON "OperationalAssignmentLocation"("assignmentId", "sortOrder");

ALTER TABLE "OperationalAssignmentLocation"
  ADD CONSTRAINT "OperationalAssignmentLocation_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "OperationalAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalAssignmentLocation"
  ADD CONSTRAINT "OperationalAssignmentLocation_unitSpaceId_fkey"
  FOREIGN KEY ("unitSpaceId") REFERENCES "UnitSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
