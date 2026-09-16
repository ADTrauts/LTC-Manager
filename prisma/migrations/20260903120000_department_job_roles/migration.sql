-- Department-owned Job Roles (operational tier + capabilities) and per-Department employee assignment.
-- Distinct from JobTitle and RoleKey. Does not change runtime authorization.

CREATE TYPE "DepartmentJobRoleTier" AS ENUM ('TEAM_MEMBER', 'LEAD', 'SUPERVISOR', 'MANAGER');

CREATE TYPE "DepartmentJobRoleStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "DepartmentJobRole" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "tier" "DepartmentJobRoleTier" NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "status" "DepartmentJobRoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentJobRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeDepartmentJobRole" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "jobRoleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDepartmentJobRole_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DepartmentJobRole_facilityId_departmentId_status_displayOrder_idx"
ON "DepartmentJobRole"("facilityId", "departmentId", "status", "displayOrder");

CREATE INDEX "DepartmentJobRole_departmentId_status_idx"
ON "DepartmentJobRole"("departmentId", "status");

CREATE UNIQUE INDEX "EmployeeDepartmentJobRole_employeeId_departmentId_key"
ON "EmployeeDepartmentJobRole"("employeeId", "departmentId");

CREATE INDEX "EmployeeDepartmentJobRole_employeeId_idx"
ON "EmployeeDepartmentJobRole"("employeeId");

CREATE INDEX "EmployeeDepartmentJobRole_departmentId_idx"
ON "EmployeeDepartmentJobRole"("departmentId");

CREATE INDEX "EmployeeDepartmentJobRole_jobRoleId_idx"
ON "EmployeeDepartmentJobRole"("jobRoleId");

ALTER TABLE "DepartmentJobRole"
ADD CONSTRAINT "DepartmentJobRole_facilityId_fkey"
FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentJobRole"
ADD CONSTRAINT "DepartmentJobRole_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeDepartmentJobRole"
ADD CONSTRAINT "EmployeeDepartmentJobRole_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeDepartmentJobRole"
ADD CONSTRAINT "EmployeeDepartmentJobRole_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeDepartmentJobRole"
ADD CONSTRAINT "EmployeeDepartmentJobRole_jobRoleId_fkey"
FOREIGN KEY ("jobRoleId") REFERENCES "DepartmentJobRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
