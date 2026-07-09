-- New enum labels must be committed before use (PG 55P04). This migration only extends the enum.
ALTER TYPE "RoleKey" ADD VALUE 'FACILITY_ADMINISTRATOR';
