-- Inspection scoring metadata on Catalog definitions. Scores stay derived from the snapshot.
ALTER TYPE "OperationalEvidenceFieldType" ADD VALUE 'COMPLIANCE';

ALTER TABLE "CatalogLogDefinition" ADD COLUMN "passingScore" INTEGER;
ALTER TABLE "CatalogLogDefinition" ADD COLUMN "criticalFailureForcesFailure" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CatalogLogDefinition" ADD COLUMN "sectionsJson" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "CatalogLogField" ADD COLUMN "sectionKey" TEXT;
ALTER TABLE "CatalogLogField" ADD COLUMN "scoreWeight" INTEGER;
ALTER TABLE "CatalogLogField" ADD COLUMN "critical" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CatalogLogField" ADD COLUMN "creditValues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
