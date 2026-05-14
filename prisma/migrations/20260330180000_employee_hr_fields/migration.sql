-- CreateEnum
CREATE TYPE "JobClassification" AS ENUM ('COOK', 'FOOD_SERVICE_WORKER', 'DIET_CLERK', 'DIETITIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkStation" AS ENUM ('COOK', 'SERVER', 'DISHWASHER', 'RETAIL', 'DIET', 'OFFICE', 'PORTER', 'UTILITY');

-- CreateEnum
CREATE TYPE "ChrcStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'CLEARED', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "unionMember" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Employee" ADD COLUMN     "hireDate" DATE;
ALTER TABLE "Employee" ADD COLUMN     "birthMonth" INTEGER;
ALTER TABLE "Employee" ADD COLUMN     "birthDay" INTEGER;
ALTER TABLE "Employee" ADD COLUMN     "jobClassification" "JobClassification";
ALTER TABLE "Employee" ADD COLUMN     "unionDisciplineTracking" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Employee" ADD COLUMN     "chrcStatus" "ChrcStatus";
ALTER TABLE "Employee" ADD COLUMN     "chrcClearedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN     "chrcNotes" TEXT;
ALTER TABLE "Employee" ADD COLUMN     "onLeave" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Employee" ADD COLUMN     "shirtSize" TEXT;
ALTER TABLE "Employee" ADD COLUMN     "hrNotes" TEXT;

-- CreateIndex
CREATE INDEX "Employee_facilityId_unionMember_idx" ON "Employee"("facilityId", "unionMember");

-- CreateIndex
CREATE INDEX "Employee_birthMonth_birthDay_idx" ON "Employee"("birthMonth", "birthDay");

-- CreateTable
CREATE TABLE "EmployeeWorkStation" (
    "employeeId" TEXT NOT NULL,
    "station" "WorkStation" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeWorkStation_pkey" PRIMARY KEY ("employeeId","station")
);

-- CreateIndex
CREATE INDEX "EmployeeWorkStation_employeeId_idx" ON "EmployeeWorkStation"("employeeId");

-- AddForeignKey
ALTER TABLE "EmployeeWorkStation" ADD CONSTRAINT "EmployeeWorkStation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
