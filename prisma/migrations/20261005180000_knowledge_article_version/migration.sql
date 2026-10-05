-- CreateEnum
CREATE TYPE "KnowledgeArticleVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "KnowledgeArticleVersion" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "KnowledgeArticleVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdFromVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleVersion_articleId_version_key" ON "KnowledgeArticleVersion"("articleId", "version");

-- CreateIndex
CREATE INDEX "KnowledgeArticleVersion_articleId_status_idx" ON "KnowledgeArticleVersion"("articleId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeArticleVersion_createdFromVersionId_idx" ON "KnowledgeArticleVersion"("createdFromVersionId");

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_createdFromVersionId_fkey" FOREIGN KEY ("createdFromVersionId") REFERENCES "KnowledgeArticleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill version 1 from current article content. Do not rewrite KnowledgeArticle rows.
-- Mapping: PUBLISHED → v1 PUBLISHED; ARCHIVED → v1 ARCHIVED (preserve publishedAt);
-- otherwise → v1 DRAFT. Do not fabricate earlier versions that never existed.
INSERT INTO "KnowledgeArticleVersion" (
    "id",
    "articleId",
    "version",
    "status",
    "title",
    "summary",
    "body",
    "createdByUserId",
    "publishedAt",
    "archivedAt",
    "createdFromVersionId",
    "createdAt",
    "updatedAt"
)
SELECT
    'v1_' || "id",
    "id",
    1,
    CASE
        WHEN "status" = 'PUBLISHED' THEN 'PUBLISHED'::"KnowledgeArticleVersionStatus"
        WHEN "status" = 'ARCHIVED' THEN 'ARCHIVED'::"KnowledgeArticleVersionStatus"
        ELSE 'DRAFT'::"KnowledgeArticleVersionStatus"
    END,
    "title",
    "summary",
    "body",
    "createdByUserId",
    "publishedAt",
    "archivedAt",
    NULL,
    "createdAt",
    CURRENT_TIMESTAMP
FROM "KnowledgeArticle"
WHERE NOT EXISTS (
    SELECT 1
    FROM "KnowledgeArticleVersion" AS existing
    WHERE existing."articleId" = "KnowledgeArticle"."id"
);
