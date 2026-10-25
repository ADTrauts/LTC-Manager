-- LEG-02: knowledge articles link published Catalog forms.
-- Older log-template and inspection links stay until LEG-06.

CREATE TABLE "KnowledgeArticleCatalogDefinition" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "catalogDefinitionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KnowledgeArticleCatalogDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeArticleCatalogDefinition_articleId_catalogDefinitionId_key" ON "KnowledgeArticleCatalogDefinition"("articleId", "catalogDefinitionId");
CREATE INDEX "KnowledgeArticleCatalogDefinition_catalogDefinitionId_idx" ON "KnowledgeArticleCatalogDefinition"("catalogDefinitionId");

ALTER TABLE "KnowledgeArticleCatalogDefinition" ADD CONSTRAINT "KnowledgeArticleCatalogDefinition_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeArticleCatalogDefinition" ADD CONSTRAINT "KnowledgeArticleCatalogDefinition_catalogDefinitionId_fkey" FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
