-- Constrained Catalog evidence rules. JSON data only; no executable expressions.
ALTER TABLE "CatalogLogDefinition" ADD COLUMN "rulesJson" JSONB NOT NULL DEFAULT '[]';
