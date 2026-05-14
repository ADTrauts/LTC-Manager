-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'OFF', 'TERMINATED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'PER_DIEM');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'FULL_DAY');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "roleType" "RoleKey" NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefaultAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "roleType" "RoleKey" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefaultAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shift" "ShiftType" NOT NULL,
    "roleType" "RoleKey" NOT NULL,
    "unitId" TEXT NOT NULL,
    "plannedStart" TEXT,
    "plannedEnd" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentOverride" (
    "id" TEXT NOT NULL,
    "scheduleEntryId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "mealType" "MealType",
    "employeeId" TEXT NOT NULL,
    "oldUnitId" TEXT,
    "newUnitId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employee_status_roleType_idx" ON "Employee"("status", "roleType");

-- CreateIndex
CREATE INDEX "DefaultAssignment_unitId_isActive_idx" ON "DefaultAssignment"("unitId", "isActive");

-- CreateIndex
CREATE INDEX "DefaultAssignment_employeeId_isActive_idx" ON "DefaultAssignment"("employeeId", "isActive");

-- CreateIndex
CREATE INDEX "ScheduleEntry_date_unitId_idx" ON "ScheduleEntry"("date", "unitId");

-- CreateIndex
CREATE INDEX "ScheduleEntry_employeeId_date_idx" ON "ScheduleEntry"("employeeId", "date");

-- CreateIndex
CREATE INDEX "AssignmentOverride_date_newUnitId_idx" ON "AssignmentOverride"("date", "newUnitId");

-- CreateIndex
CREATE INDEX "AssignmentOverride_employeeId_date_idx" ON "AssignmentOverride"("employeeId", "date");

-- AddForeignKey
ALTER TABLE "DefaultAssignment" ADD CONSTRAINT "DefaultAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultAssignment" ADD CONSTRAINT "DefaultAssignment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentOverride" ADD CONSTRAINT "AssignmentOverride_scheduleEntryId_fkey" FOREIGN KEY ("scheduleEntryId") REFERENCES "ScheduleEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentOverride" ADD CONSTRAINT "AssignmentOverride_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentOverride" ADD CONSTRAINT "AssignmentOverride_oldUnitId_fkey" FOREIGN KEY ("oldUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentOverride" ADD CONSTRAINT "AssignmentOverride_newUnitId_fkey" FOREIGN KEY ("newUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentOverride" ADD CONSTRAINT "AssignmentOverride_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
