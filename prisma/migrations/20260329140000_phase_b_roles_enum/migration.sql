-- New enum values must be committed before use in PostgreSQL; keep this migration SQL-only.
ALTER TYPE "RoleKey" ADD VALUE 'LEAD_TEAM_MEMBER';
