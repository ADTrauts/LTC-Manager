-- CDA-05: a vendor company admin names the Department head. Acceptance is a separate fact.

CREATE TYPE "DepartmentVendorHeadAssignmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REPLACED');

CREATE TABLE "DepartmentVendorHeadAssignment" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "operatorRelationshipId" TEXT NOT NULL,
    "assigneeUserId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "status" "DepartmentVendorHeadAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentVendorHeadAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DepartmentVendorHeadAssignment_departmentId_status_idx" ON "DepartmentVendorHeadAssignment"("departmentId", "status");
CREATE INDEX "DepartmentVendorHeadAssignment_assigneeUserId_status_idx" ON "DepartmentVendorHeadAssignment"("assigneeUserId", "status");
CREATE INDEX "DepartmentVendorHeadAssignment_operatorRelationshipId_idx" ON "DepartmentVendorHeadAssignment"("operatorRelationshipId");
CREATE INDEX "DepartmentVendorHeadAssignment_assignedByUserId_idx" ON "DepartmentVendorHeadAssignment"("assignedByUserId");

-- One open assignment per Department. Replacing or answering closes the previous row.
CREATE UNIQUE INDEX "DepartmentVendorHeadAssignment_one_open"
  ON "DepartmentVendorHeadAssignment"("departmentId")
  WHERE "status" IN ('PENDING', 'ACCEPTED');

ALTER TABLE "DepartmentVendorHeadAssignment" ADD CONSTRAINT "DepartmentVendorHeadAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentVendorHeadAssignment" ADD CONSTRAINT "DepartmentVendorHeadAssignment_operatorRelationshipId_fkey" FOREIGN KEY ("operatorRelationshipId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentVendorHeadAssignment" ADD CONSTRAINT "DepartmentVendorHeadAssignment_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepartmentVendorHeadAssignment" ADD CONSTRAINT "DepartmentVendorHeadAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
