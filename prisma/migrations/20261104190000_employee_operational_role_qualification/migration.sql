-- Department-scoped operational eligibility and an auditable Assignment exception.
-- The role key is the existing operational registry. An exception does not grant eligibility.

CREATE TYPE "EmployeeOperationalQualificationStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "EmployeeOperationalRoleQualification" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "status" "EmployeeOperationalQualificationStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeOperationalRoleQualification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalAssignmentEligibilityException" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalAssignmentEligibilityException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeOperationalRoleQualification_employeeId_departmentId_roleKey_key" ON "EmployeeOperationalRoleQualification"("employeeId", "departmentId", "roleKey");
CREATE INDEX "EmployeeOperationalRoleQualification_facilityId_departmentId_idx" ON "EmployeeOperationalRoleQualification"("facilityId", "departmentId");
CREATE INDEX "EmployeeOperationalRoleQualification_employeeId_idx" ON "EmployeeOperationalRoleQualification"("employeeId");

CREATE UNIQUE INDEX "OperationalAssignmentEligibilityException_assignmentId_key" ON "OperationalAssignmentEligibilityException"("assignmentId");
CREATE INDEX "OperationalAssignmentEligibilityException_facilityId_departmentId_idx" ON "OperationalAssignmentEligibilityException"("facilityId", "departmentId");
CREATE INDEX "OperationalAssignmentEligibilityException_employeeId_idx" ON "OperationalAssignmentEligibilityException"("employeeId");

ALTER TABLE "EmployeeOperationalRoleQualification" ADD CONSTRAINT "EmployeeOperationalRoleQualification_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeOperationalRoleQualification" ADD CONSTRAINT "EmployeeOperationalRoleQualification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeOperationalRoleQualification" ADD CONSTRAINT "EmployeeOperationalRoleQualification_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalAssignmentEligibilityException" ADD CONSTRAINT "OperationalAssignmentEligibilityException_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "OperationalAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalAssignmentEligibilityException" ADD CONSTRAINT "OperationalAssignmentEligibilityException_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalAssignmentEligibilityException" ADD CONSTRAINT "OperationalAssignmentEligibilityException_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalAssignmentEligibilityException" ADD CONSTRAINT "OperationalAssignmentEligibilityException_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalAssignmentEligibilityException" ADD CONSTRAINT "OperationalAssignmentEligibilityException_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
