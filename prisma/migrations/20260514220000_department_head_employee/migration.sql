-- Department operational lead (department head), optional FK to Employee.
ALTER TABLE "Department" ADD COLUMN "headEmployeeId" TEXT;

CREATE INDEX "Department_headEmployeeId_idx" ON "Department"("headEmployeeId");

ALTER TABLE "Department"
ADD CONSTRAINT "Department_headEmployeeId_fkey"
FOREIGN KEY ("headEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
