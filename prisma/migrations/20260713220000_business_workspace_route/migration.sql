-- Wave 12 M1: Business Workspace primary nav route; Operations Center stays as module (nav hidden).

INSERT INTO "AppRoute" ("id", "key", "pathPrefix", "label", "navVisible", "navOrder", "isActive", "isCritical", "createdAt", "updatedAt")
SELECT
  'cmrtworkspace00000000000001',
  'workspace',
  '/workspace',
  'Workspace',
  true,
  5,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "AppRoute" WHERE "pathPrefix" = '/workspace'
);

UPDATE "AppRoute"
SET "navVisible" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "pathPrefix" = '/dashboard';

-- Grant workspace to SUPERVISOR+ (mirror today's work entitlement ladder)
INSERT INTO "RoleRoutePermission" ("id", "roleId", "appRouteId", "allowed", "createdAt", "updatedAt")
SELECT
  'cmrpws_' || r."id",
  r."id",
  ar."id",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Role" r
CROSS JOIN "AppRoute" ar
WHERE ar."pathPrefix" = '/workspace'
  AND r."key" IN ('FACILITY_ADMINISTRATOR', 'GM', 'MANAGER', 'SUPERVISOR')
  AND NOT EXISTS (
    SELECT 1
    FROM "RoleRoutePermission" rrp
    WHERE rrp."roleId" = r."id" AND rrp."appRouteId" = ar."id"
  );
