-- CreateEnum
CREATE TYPE "OperationInstanceStatus" AS ENUM ('SCHEDULED', 'PREPARATION', 'EXECUTION', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "OperationDefinition" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "mealType" "MealType",
    "workShiftId" TEXT,
    "scheduledStartLocal" TEXT,
    "scheduledEndLocal" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationInstance" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "mealType" "MealType",
    "label" TEXT NOT NULL,
    "status" "OperationInstanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "workShiftId" TEXT,
    "scheduledStartLocal" TEXT,
    "scheduledEndLocal" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationDefinition_facilityId_idx" ON "OperationDefinition"("facilityId");

-- CreateIndex
CREATE INDEX "OperationDefinition_departmentId_idx" ON "OperationDefinition"("departmentId");

-- CreateIndex
CREATE INDEX "OperationDefinition_workShiftId_idx" ON "OperationDefinition"("workShiftId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationDefinition_facilityId_departmentId_key_key" ON "OperationDefinition"("facilityId", "departmentId", "key");

-- CreateIndex
CREATE INDEX "OperationInstance_facilityId_serviceDate_idx" ON "OperationInstance"("facilityId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationInstance_departmentId_serviceDate_idx" ON "OperationInstance"("departmentId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationInstance_facilityId_departmentId_serviceDate_idx" ON "OperationInstance"("facilityId", "departmentId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationInstance_status_idx" ON "OperationInstance"("status");

-- CreateIndex
CREATE INDEX "OperationInstance_workShiftId_idx" ON "OperationInstance"("workShiftId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationInstance_definitionId_serviceDate_key" ON "OperationInstance"("definitionId", "serviceDate");

-- AddForeignKey
ALTER TABLE "OperationDefinition" ADD CONSTRAINT "OperationDefinition_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationInstance" ADD CONSTRAINT "OperationInstance_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationInstance" ADD CONSTRAINT "OperationInstance_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "OperationDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
