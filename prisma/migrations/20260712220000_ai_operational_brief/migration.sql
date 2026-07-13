-- CreateEnum
CREATE TYPE "AiBriefStatus" AS ENUM ('READY', 'FALLBACK', 'FAILED');

-- CreateTable
CREATE TABLE "AiOperationalBrief" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "operationInstanceId" TEXT,
    "snapshotHash" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AiBriefStatus" NOT NULL DEFAULT 'READY',
    "promptVersion" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiOperationalBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiOperationalBrief_facilityId_departmentKey_serviceDate_idx" ON "AiOperationalBrief"("facilityId", "departmentKey", "serviceDate");

-- CreateIndex
CREATE INDEX "AiOperationalBrief_facilityId_generatedAt_idx" ON "AiOperationalBrief"("facilityId", "generatedAt");

-- CreateIndex
CREATE INDEX "AiOperationalBrief_expiresAt_idx" ON "AiOperationalBrief"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiOperationalBrief_facilityId_departmentKey_serviceDate_snapshotHash_key" ON "AiOperationalBrief"("facilityId", "departmentKey", "serviceDate", "snapshotHash");

-- AddForeignKey
ALTER TABLE "AiOperationalBrief" ADD CONSTRAINT "AiOperationalBrief_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
