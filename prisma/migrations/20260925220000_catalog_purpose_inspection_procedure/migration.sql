-- Harbor catalog items beyond LOG/CHECKLIST: inspections and procedures.
ALTER TYPE "CatalogLogPurposeType" ADD VALUE IF NOT EXISTS 'INSPECTION';
ALTER TYPE "CatalogLogPurposeType" ADD VALUE IF NOT EXISTS 'PROCEDURE';
