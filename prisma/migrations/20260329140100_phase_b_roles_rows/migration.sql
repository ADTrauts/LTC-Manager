-- Role lookup rows (needed when `prisma db seed` is not run).
INSERT INTO "Role" ("id", "key", "name", "createdAt", "updatedAt")
VALUES
  ('cmrole_gm0000000000000001', 'GM', 'General Manager', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmrole_mgr000000000000001', 'MANAGER', 'Department Manager', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmrole_sup000000000000001', 'SUPERVISOR', 'Supervisor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmrole_lead00000000000001', 'LEAD_TEAM_MEMBER', 'Lead Team Member', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmrole_staff0000000000001', 'STAFF', 'Team Member', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "updatedAt" = CURRENT_TIMESTAMP;
