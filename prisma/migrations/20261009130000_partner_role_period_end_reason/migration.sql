-- Explicit cause for a closed partner role period.
-- Nullable so historical closed periods stay unexplained rather than guessed.
-- Open periods and pre-migration closed periods keep endReason null.

CREATE TYPE "PartnerUserRolePeriodEndReason" AS ENUM (
  'ROLE_CHANGED',
  'ASSIGNMENT_ENDED',
  'FACILITY_BLOCKED',
  'ORGANIZATION_MEMBERSHIP_ENDED'
);

ALTER TABLE "PartnerUserRolePeriod"
  ADD COLUMN "endReason" "PartnerUserRolePeriodEndReason";
