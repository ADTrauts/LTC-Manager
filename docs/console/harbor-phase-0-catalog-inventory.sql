-- Run on the approved canonical snapshot or read replica with a SELECT-only role.
-- Results are counts. Resolve candidates in a restricted session using the same predicates.
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';

WITH lineages AS (
  SELECT "stableKey", bool_or("ownerKind" <> 'VSSYL') AS has_private_version
  FROM "CatalogLogDefinition"
  GROUP BY "stableKey"
), classified AS (
  SELECT d.id, d."stableKey", d.version, d."ownerKind", d.status,
    d."ownerFacilityId", d."ownerOrganizationId", d."operatorPeriodId", d."createdAt",
    CASE
      WHEN d."ownerKind" = 'VSSYL' AND
        (d."ownerFacilityId" IS NOT NULL OR d."ownerOrganizationId" IS NOT NULL
         OR d."operatorPeriodId" IS NOT NULL) THEN 'platform_owner_conflict'
      WHEN d."ownerKind" = 'VSSYL' AND l.has_private_version THEN 'mixed_platform_private_lineage'
      WHEN d."ownerKind" = 'VSSYL' THEN 'platform_owner_needs_provenance'
      WHEN d."ownerKind" = 'FACILITY' AND
        (d."ownerFacilityId" IS NULL OR d."ownerOrganizationId" IS NOT NULL
         OR (d."operatorPeriodId" IS NOT NULL AND dep."facilityId" IS DISTINCT FROM d."ownerFacilityId"))
        THEN 'private_owner_conflict'
      WHEN d."ownerKind" = 'ORGANIZATION' AND
        (d."ownerOrganizationId" IS NULL OR d."ownerFacilityId" IS NOT NULL
         OR (d."operatorPeriodId" IS NOT NULL AND period."organizationId" IS DISTINCT FROM d."ownerOrganizationId"))
        THEN 'private_owner_conflict'
      ELSE 'private_owner_fields_consistent'
    END AS evidence
  FROM "CatalogLogDefinition" d
  JOIN lineages l ON l."stableKey" = d."stableKey"
  LEFT JOIN "DepartmentOperatorRelationship" period ON period.id = d."operatorPeriodId"
  LEFT JOIN "Department" dep ON dep.id = period."departmentId"
)
SELECT "ownerKind", status, evidence, count(*) AS versions
FROM classified
GROUP BY "ownerKind", status, evidence
ORDER BY "ownerKind", status, evidence;

ROLLBACK;
