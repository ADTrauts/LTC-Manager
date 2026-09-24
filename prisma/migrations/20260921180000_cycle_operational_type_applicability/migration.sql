-- Operational Type targeting for Operational Cycles.
-- Compatibility modes ALL_DEPARTMENT_UNITS / UNIT_TYPES / EXPLICIT_UNITS / ROOM_TYPE are unchanged.

ALTER TYPE "OperationalCycleLocationMode" ADD VALUE IF NOT EXISTS 'OPERATIONAL_TYPES';

ALTER TABLE "DepartmentOperationalCycle"
ADD COLUMN IF NOT EXISTS "applicableOperationalTypeKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
