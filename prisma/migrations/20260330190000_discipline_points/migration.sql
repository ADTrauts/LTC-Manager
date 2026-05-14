-- CreateEnum
CREATE TYPE "DisciplinePointCategory" AS ENUM ('ATTENDANCE', 'PERFORMANCE');

-- CreateTable
CREATE TABLE "DisciplinePointEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" "DisciplinePointCategory" NOT NULL,
    "points" INTEGER NOT NULL,
    "occurredAt" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisciplinePointEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisciplinePointEntry_employeeId_occurredAt_idx" ON "DisciplinePointEntry"("employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "DisciplinePointEntry_employeeId_category_idx" ON "DisciplinePointEntry"("employeeId", "category");

-- AddForeignKey
ALTER TABLE "DisciplinePointEntry" ADD CONSTRAINT "DisciplinePointEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinePointEntry" ADD CONSTRAINT "DisciplinePointEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
