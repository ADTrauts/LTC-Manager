-- CreateEnum
CREATE TYPE "KnowledgeArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeArticleCategory" AS ENUM (
  'SOP',
  'EQUIPMENT',
  'LOCATION',
  'SAFETY',
  'COMPLIANCE',
  'TROUBLESHOOTING',
  'TRAINING',
  'REFERENCE',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM (
  'MANUAL',
  'HANDBOOK',
  'VENDOR',
  'POLICY',
  'INCIDENT_LESSON',
  'OTHER'
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "departmentId" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "body" TEXT NOT NULL,
  "status" "KnowledgeArticleStatus" NOT NULL DEFAULT 'DRAFT',
  "category" "KnowledgeArticleCategory" NOT NULL,
  "sourceType" "KnowledgeSourceType" NOT NULL DEFAULT 'MANUAL',
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleUnit" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KnowledgeArticleUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleAsset" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KnowledgeArticleAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleLogTemplate" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "logTemplateId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KnowledgeArticleLogTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleInspectionDefinition" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "inspectionDefinitionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KnowledgeArticleInspectionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeArticle_facilityId_status_idx" ON "KnowledgeArticle"("facilityId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_facilityId_category_idx" ON "KnowledgeArticle"("facilityId", "category");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_facilityId_departmentId_idx" ON "KnowledgeArticle"("facilityId", "departmentId");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_facilityId_status_category_idx" ON "KnowledgeArticle"("facilityId", "status", "category");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleUnit_articleId_unitId_key" ON "KnowledgeArticleUnit"("articleId", "unitId");

-- CreateIndex
CREATE INDEX "KnowledgeArticleUnit_unitId_idx" ON "KnowledgeArticleUnit"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleAsset_articleId_assetId_key" ON "KnowledgeArticleAsset"("articleId", "assetId");

-- CreateIndex
CREATE INDEX "KnowledgeArticleAsset_assetId_idx" ON "KnowledgeArticleAsset"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleLogTemplate_articleId_logTemplateId_key" ON "KnowledgeArticleLogTemplate"("articleId", "logTemplateId");

-- CreateIndex
CREATE INDEX "KnowledgeArticleLogTemplate_logTemplateId_idx" ON "KnowledgeArticleLogTemplate"("logTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleInspectionDefinition_articleId_inspectionDefinitionId_key" ON "KnowledgeArticleInspectionDefinition"("articleId", "inspectionDefinitionId");

-- CreateIndex
CREATE INDEX "KnowledgeArticleInspectionDefinition_inspectionDefinitionId_idx" ON "KnowledgeArticleInspectionDefinition"("inspectionDefinitionId");

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleUnit" ADD CONSTRAINT "KnowledgeArticleUnit_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleUnit" ADD CONSTRAINT "KnowledgeArticleUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleAsset" ADD CONSTRAINT "KnowledgeArticleAsset_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleAsset" ADD CONSTRAINT "KnowledgeArticleAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleLogTemplate" ADD CONSTRAINT "KnowledgeArticleLogTemplate_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleLogTemplate" ADD CONSTRAINT "KnowledgeArticleLogTemplate_logTemplateId_fkey" FOREIGN KEY ("logTemplateId") REFERENCES "LogTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleInspectionDefinition" ADD CONSTRAINT "KnowledgeArticleInspectionDefinition_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleInspectionDefinition" ADD CONSTRAINT "KnowledgeArticleInspectionDefinition_inspectionDefinitionId_fkey" FOREIGN KEY ("inspectionDefinitionId") REFERENCES "InspectionDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
