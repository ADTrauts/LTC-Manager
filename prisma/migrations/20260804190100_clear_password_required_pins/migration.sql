-- Clear legacy Quick PIN credentials for Employees whose role requires an email/password account.
--
-- Before this release the PIN login handler did not check credential eligibility, so a PIN issued
-- while an Employee was STAFF or LEAD_TEAM_MEMBER kept working after promotion and could mint a
-- session at the promoted authority. Application code now refuses these roles at PIN issuance and
-- at PIN login; this statement removes the data that predates that enforcement.
--
-- The role list mirrors `requiresEmailPasswordAccount` in src/lib/credential-policy.ts.
-- Deterministic, idempotent, safe on an empty database, and a no-op when no invalid rows exist.
-- Only "pinDigest" is written; no other Employee column is touched and no prior value is retained.

UPDATE "Employee"
SET "pinDigest" = NULL
WHERE "pinDigest" IS NOT NULL
  AND "roleType" IN ('FACILITY_ADMINISTRATOR', 'GM', 'MANAGER', 'SUPERVISOR');
