-- Same count/check race as Repair codes, reproduced during focused closeout tests.
-- Preserve existing identifiers and monotonically allocate new codes across Facilities.
CREATE SEQUENCE "AssetIssueCodeSequence" AS bigint MINVALUE 1;
SELECT setval('"AssetIssueCodeSequence"',
  GREATEST(COALESCE((SELECT MAX(substring("issueCode" FROM '^AI-([0-9]+)$')::bigint) FROM "AssetIssue"), 0) + 1, 1), false);
CREATE SEQUENCE "AssetCodeSequence" AS bigint MINVALUE 1;
SELECT setval('"AssetCodeSequence"',
  GREATEST(COALESCE((SELECT MAX(substring("assetCode" FROM '^A-([0-9]+)$')::bigint) FROM "Asset"), 0) + 1, 1), false);
