-- CreateEnum
CREATE TYPE "AssetCriticality" AS ENUM ('CRITICAL', 'IMPORTANT', 'ROUTINE');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "criticality" "AssetCriticality" NOT NULL DEFAULT 'ROUTINE';

-- CreateIndex
CREATE INDEX "Asset_unitId_criticality_idx" ON "Asset"("unitId", "criticality");
