-- Repeating groups and calculations stay on the Catalog definition and the submission snapshot.
-- Repeat evidence is structured field values under OperationalEvidenceRecord.

ALTER TABLE "CatalogLogDefinition" ADD COLUMN "repeatingGroupsJson" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CatalogLogDefinition" ADD COLUMN "calculationsJson" JSONB NOT NULL DEFAULT '[]';

DROP INDEX "OperationalEvidenceFieldValue_recordId_fieldKey_key";
ALTER TABLE "OperationalEvidenceFieldValue" ADD COLUMN "groupKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OperationalEvidenceFieldValue" ADD COLUMN "rowKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OperationalEvidenceFieldValue" ADD COLUMN "rowSequence" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "OperationalEvidenceFieldValue_recordId_fieldKey_groupKey_rowKey_key"
  ON "OperationalEvidenceFieldValue"("recordId", "fieldKey", "groupKey", "rowKey");

CREATE TABLE "CatalogSectionComponent" (
  "id" TEXT NOT NULL,
  "stableKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "CatalogLogStatus" NOT NULL DEFAULT 'DRAFT',
  "name" TEXT NOT NULL,
  "description" TEXT,
  "structureJson" JSONB NOT NULL DEFAULT '{}',
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogSectionComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogSectionComponent_stableKey_version_key" ON "CatalogSectionComponent"("stableKey", "version");
CREATE INDEX "CatalogSectionComponent_stableKey_status_idx" ON "CatalogSectionComponent"("stableKey", "status");
