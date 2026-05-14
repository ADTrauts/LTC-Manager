-- CreateTable
CREATE TABLE "EmployeeUnitAccess" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeUnitAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeUnitAccess_employeeId_unitId_key" ON "EmployeeUnitAccess"("employeeId", "unitId");

-- CreateIndex
CREATE INDEX "EmployeeUnitAccess_employeeId_idx" ON "EmployeeUnitAccess"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeUnitAccess_unitId_idx" ON "EmployeeUnitAccess"("unitId");

-- AddForeignKey
ALTER TABLE "EmployeeUnitAccess" ADD CONSTRAINT "EmployeeUnitAccess_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeUnitAccess" ADD CONSTRAINT "EmployeeUnitAccess_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "primaryUnitId" TEXT;

-- CreateIndex
CREATE INDEX "Employee_primaryUnitId_idx" ON "Employee"("primaryUnitId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_primaryUnitId_fkey" FOREIGN KEY ("primaryUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
