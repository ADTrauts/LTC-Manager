-- Location Architecture Stage 1: Facility Builder Foundation (Schema Only)
-- Adds UnitSpace, SpaceType, UnitSpaceResponsibility, extends UnitDepartmentResponsibility

-- CreateEnum
CREATE TYPE "SpaceType" AS ENUM ('SERVICE_AREA', 'PATIENT_ROOM', 'PRODUCTION_AREA', 'STORAGE', 'UTILITY', 'OFFICE', 'RESTROOM', 'MECHANICAL', 'PUBLIC_AREA', 'OTHER');

-- AlterEnum: Add SUPPORT to UnitDepartmentKind
ALTER TYPE "UnitDepartmentKind" ADD VALUE 'SUPPORT';

-- AlterTable: Add capabilities to UnitDepartmentResponsibility
ALTER TABLE "UnitDepartmentResponsibility" ADD COLUMN "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable: UnitSpace
CREATE TABLE "UnitSpace" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spaceType" "SpaceType" NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UnitSpaceResponsibility
CREATE TABLE "UnitSpaceResponsibility" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitSpaceResponsibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnitSpace_unitId_name_key" ON "UnitSpace"("unitId", "name");
CREATE INDEX "UnitSpace_facilityId_idx" ON "UnitSpace"("facilityId");
CREATE INDEX "UnitSpace_unitId_isActive_sortOrder_idx" ON "UnitSpace"("unitId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "UnitSpaceResponsibility_spaceId_departmentId_key" ON "UnitSpaceResponsibility"("spaceId", "departmentId");
CREATE INDEX "UnitSpaceResponsibility_spaceId_idx" ON "UnitSpaceResponsibility"("spaceId");
CREATE INDEX "UnitSpaceResponsibility_departmentId_idx" ON "UnitSpaceResponsibility"("departmentId");

-- AddForeignKey
ALTER TABLE "UnitSpace" ADD CONSTRAINT "UnitSpace_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitSpace" ADD CONSTRAINT "UnitSpace_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitSpaceResponsibility" ADD CONSTRAINT "UnitSpaceResponsibility_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitSpaceResponsibility" ADD CONSTRAINT "UnitSpaceResponsibility_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
