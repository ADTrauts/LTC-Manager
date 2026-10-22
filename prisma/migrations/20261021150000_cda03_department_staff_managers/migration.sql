-- CDA-03: managers a Department head allows to add staff and set roles (CDA-D03). Additive only.

-- CreateTable
CREATE TABLE "DepartmentStaffManager" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "grantedByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentStaffManager_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepartmentStaffManager_employeeId_idx" ON "DepartmentStaffManager"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentStaffManager_departmentId_employeeId_key" ON "DepartmentStaffManager"("departmentId", "employeeId");

-- AddForeignKey
ALTER TABLE "DepartmentStaffManager" ADD CONSTRAINT "DepartmentStaffManager_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentStaffManager" ADD CONSTRAINT "DepartmentStaffManager_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

