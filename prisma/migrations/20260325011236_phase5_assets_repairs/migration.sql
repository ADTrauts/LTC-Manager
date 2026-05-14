-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'OUT_OF_SERVICE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RepairPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'CLOSED');

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "contactName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "model" TEXT,
    "serialNumber" TEXT,
    "vendorId" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repair" (
    "id" TEXT NOT NULL,
    "repairCode" TEXT NOT NULL,
    "assetId" TEXT,
    "unitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "RepairPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "RepairStatus" NOT NULL DEFAULT 'OPEN',
    "reportedById" TEXT,
    "vendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairUpdate" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "updateText" TEXT NOT NULL,
    "updatedById" TEXT,
    "statusAfterUpdate" "RepairStatus",
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetCode_key" ON "Asset"("assetCode");

-- CreateIndex
CREATE INDEX "Asset_unitId_status_idx" ON "Asset"("unitId", "status");

-- CreateIndex
CREATE INDEX "Asset_vendorId_idx" ON "Asset"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Repair_repairCode_key" ON "Repair"("repairCode");

-- CreateIndex
CREATE INDEX "Repair_unitId_status_idx" ON "Repair"("unitId", "status");

-- CreateIndex
CREATE INDEX "Repair_priority_status_idx" ON "Repair"("priority", "status");

-- CreateIndex
CREATE INDEX "RepairUpdate_repairId_updatedAt_idx" ON "RepairUpdate"("repairId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairUpdate" ADD CONSTRAINT "RepairUpdate_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairUpdate" ADD CONSTRAINT "RepairUpdate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
