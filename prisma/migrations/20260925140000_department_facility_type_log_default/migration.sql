-- Department-scoped log defaults on a Facility Room Type.
-- Rooms of that type inherit; one room can suppress without deleting the default.

CREATE TABLE "DepartmentFacilityTypeLogDefault" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "facilityRoomTypeId" TEXT NOT NULL,
    "catalogDefinitionId" TEXT NOT NULL,
    "catalogStableKey" TEXT NOT NULL,
    "catalogVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentFacilityTypeLogDefault_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentFacilityTypeLogDefault_departmentId_facilityRoomTypeId_catalogStableKey_key"
ON "DepartmentFacilityTypeLogDefault"("departmentId", "facilityRoomTypeId", "catalogStableKey");

CREATE INDEX "DepartmentFacilityTypeLogDefault_facilityId_departmentId_idx"
ON "DepartmentFacilityTypeLogDefault"("facilityId", "departmentId");

CREATE INDEX "DepartmentFacilityTypeLogDefault_facilityRoomTypeId_idx"
ON "DepartmentFacilityTypeLogDefault"("facilityRoomTypeId");

ALTER TABLE "DepartmentFacilityTypeLogDefault"
ADD CONSTRAINT "DepartmentFacilityTypeLogDefault_facilityId_fkey"
FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentFacilityTypeLogDefault"
ADD CONSTRAINT "DepartmentFacilityTypeLogDefault_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentFacilityTypeLogDefault"
ADD CONSTRAINT "DepartmentFacilityTypeLogDefault_facilityRoomTypeId_fkey"
FOREIGN KEY ("facilityRoomTypeId") REFERENCES "FacilityRoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentFacilityTypeLogDefault"
ADD CONSTRAINT "DepartmentFacilityTypeLogDefault_catalogDefinitionId_fkey"
FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DepartmentLocationLogSuppression" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "defaultId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentLocationLogSuppression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentLocationLogSuppression_spaceId_defaultId_key"
ON "DepartmentLocationLogSuppression"("spaceId", "defaultId");

CREATE INDEX "DepartmentLocationLogSuppression_departmentId_idx"
ON "DepartmentLocationLogSuppression"("departmentId");

ALTER TABLE "DepartmentLocationLogSuppression"
ADD CONSTRAINT "DepartmentLocationLogSuppression_spaceId_fkey"
FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentLocationLogSuppression"
ADD CONSTRAINT "DepartmentLocationLogSuppression_defaultId_fkey"
FOREIGN KEY ("defaultId") REFERENCES "DepartmentFacilityTypeLogDefault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
