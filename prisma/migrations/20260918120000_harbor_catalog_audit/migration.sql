-- Harbor Catalog authoring audit. Catalog rows stay platform-scoped (no facilityId).

ALTER TYPE "HarborAuditAction" ADD VALUE IF NOT EXISTS 'CATALOG_CREATE';
ALTER TYPE "HarborAuditAction" ADD VALUE IF NOT EXISTS 'CATALOG_PUBLISH';
ALTER TYPE "HarborAuditAction" ADD VALUE IF NOT EXISTS 'CATALOG_RETIRE';
ALTER TYPE "HarborAuditAction" ADD VALUE IF NOT EXISTS 'CATALOG_DRAFT_SUCCESSOR';
