-- Facility union handbook (PDF on disk; path stored here)
ALTER TABLE "Facility" ADD COLUMN "unionHandbookPdfPath" TEXT;
ALTER TABLE "Facility" ADD COLUMN "unionHandbookOriginalFilename" TEXT;
ALTER TABLE "Facility" ADD COLUMN "unionHandbookUploadedAt" TIMESTAMP(3);
ALTER TABLE "Facility" ADD COLUMN "unionHandbookEffectiveDate" DATE;

-- HR audit log
CREATE TABLE "EmployeeHrAuditLog" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT,
    "fieldKey" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeHrAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeeHrAuditLog_facilityId_createdAt_idx" ON "EmployeeHrAuditLog"("facilityId", "createdAt");
CREATE INDEX "EmployeeHrAuditLog_employeeId_createdAt_idx" ON "EmployeeHrAuditLog"("employeeId", "createdAt");
ALTER TABLE "EmployeeHrAuditLog" ADD CONSTRAINT "EmployeeHrAuditLog_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeHrAuditLog" ADD CONSTRAINT "EmployeeHrAuditLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeHrAuditLog" ADD CONSTRAINT "EmployeeHrAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Immutable termination snapshots
CREATE TABLE "EmployeeTerminationRecord" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "terminatedAt" DATE NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeTerminationRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeeTerminationRecord_facilityId_terminatedAt_idx" ON "EmployeeTerminationRecord"("facilityId", "terminatedAt");
CREATE INDEX "EmployeeTerminationRecord_employeeId_idx" ON "EmployeeTerminationRecord"("employeeId");
ALTER TABLE "EmployeeTerminationRecord" ADD CONSTRAINT "EmployeeTerminationRecord_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeTerminationRecord" ADD CONSTRAINT "EmployeeTerminationRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeTerminationRecord" ADD CONSTRAINT "EmployeeTerminationRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
