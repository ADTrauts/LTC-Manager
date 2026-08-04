-- Depends on 20260615103000: RoleKey.FACILITY_ADMINISTRATOR is committed and safe to reference.

-- Insert Role row for Facility Administrator (id stable for reproducible seeds)
INSERT INTO "Role" ("id", "key", "name", "createdAt", "updatedAt")
VALUES
  ('cmrole_fa000000000000001', 'FACILITY_ADMINISTRATOR', 'Facility Administrator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Copy existing GM route matrix to Facility Administrator (same access as former facility GM)
INSERT INTO "RoleRoutePermission" ("id", "roleId", "appRouteId", "allowed", "createdAt", "updatedAt")
SELECT
  concat('cmperm_fa_', substring(md5(random()::text || rrp."appRouteId"), 1, 20)),
  (SELECT "id" FROM "Role" WHERE "key" = 'FACILITY_ADMINISTRATOR' LIMIT 1),
  rrp."appRouteId",
  rrp."allowed",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "RoleRoutePermission" rrp
INNER JOIN "Role" gm ON gm."id" = rrp."roleId" AND gm."key" = 'GM'
WHERE NOT EXISTS (
  SELECT 1
  FROM "RoleRoutePermission" existing
  WHERE existing."appRouteId" = rrp."appRouteId"
    AND existing."roleId" = (SELECT "id" FROM "Role" WHERE "key" = 'FACILITY_ADMINISTRATOR' LIMIT 1)
);

-- Promote facility email users previously on GM (first admin per signup) to Facility Administrator
UPDATE "User" u
SET "roleId" = (SELECT r.id FROM "Role" r WHERE r.key = 'FACILITY_ADMINISTRATOR' LIMIT 1)
FROM "Role" prev
WHERE u."roleId" = prev.id
  AND prev.key = 'GM';

-- Mirror FA role on Employee roster rows for users we just promoted (same facility + lowercase email match)
UPDATE "Employee" e
SET "roleType" = 'FACILITY_ADMINISTRATOR'::"RoleKey"
FROM "User" u
WHERE e."facilityId" = u."facilityId"
  AND e."email" IS NOT NULL
  AND lower(trim(e."email")) = lower(trim(u."email"))
  AND u."roleId" = (SELECT id FROM "Role" WHERE key = 'FACILITY_ADMINISTRATOR' LIMIT 1);

-- Per-department membership: permission tier defaults to Staff for existing rows
ALTER TABLE "EmployeeDepartment" ADD COLUMN "roleType" "RoleKey" NOT NULL DEFAULT 'STAFF';

CREATE TYPE "RepairTrade" AS ENUM ('EQUIPMENT', 'PLUMBING', 'ELECTRICAL', 'GENERAL');

ALTER TABLE "Repair" ADD COLUMN "repairTrade" "RepairTrade" NOT NULL DEFAULT 'GENERAL';

-- /admin route: Facility Administrator only — remove from other roles
UPDATE "RoleRoutePermission" rrp
SET "allowed" = false,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "AppRoute" ar
WHERE rrp."appRouteId" = ar.id
  AND ar."pathPrefix" = '/admin';

UPDATE "RoleRoutePermission" rrp
SET "allowed" = true,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "AppRoute" ar, "Role" ro
WHERE rrp."appRouteId" = ar.id
  AND ar."pathPrefix" = '/admin'
  AND rrp."roleId" = ro.id
  AND ro.key = 'FACILITY_ADMINISTRATOR';
