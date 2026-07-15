-- CreateEnum
CREATE TYPE "OperationalAssignmentStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperationalAssignmentSource" AS ENUM ('MANUAL', 'TEMPLATE', 'COVERAGE', 'REASSIGNMENT');

-- CreateTable
CREATE TABLE "OperationalAssignment" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "unitId" TEXT,
    "operationInstanceId" TEXT,
    "serviceDate" DATE NOT NULL,
    "roleKey" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" "OperationalAssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "source" "OperationalAssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationalAssignment_facilityId_serviceDate_idx" ON "OperationalAssignment"("facilityId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalAssignment_departmentId_serviceDate_idx" ON "OperationalAssignment"("departmentId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalAssignment_employeeId_serviceDate_idx" ON "OperationalAssignment"("employeeId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalAssignment_unitId_serviceDate_idx" ON "OperationalAssignment"("unitId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalAssignment_operationInstanceId_idx" ON "OperationalAssignment"("operationInstanceId");

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_operationInstanceId_fkey" FOREIGN KEY ("operationInstanceId") REFERENCES "OperationInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
