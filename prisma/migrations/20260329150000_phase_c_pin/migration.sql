-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "pinDigest" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_facilityId_pinDigest_key" ON "Employee"("facilityId", "pinDigest");

-- AlterTable
ALTER TABLE "LogSubmission" ADD COLUMN "submittedByEmployeeId" TEXT;

-- AddForeignKey
ALTER TABLE "LogSubmission" ADD CONSTRAINT "LogSubmission_submittedByEmployeeId_fkey" FOREIGN KEY ("submittedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "LogSubmission_submittedByEmployeeId_idx" ON "LogSubmission"("submittedByEmployeeId");
