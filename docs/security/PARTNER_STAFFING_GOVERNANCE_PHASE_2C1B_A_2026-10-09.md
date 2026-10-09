# Partner staffing governance — Phase 2C1b-A

Facility-controlled delegation and veto. Organization administrators still cannot assign, change, or end partner users.

## Staffing delegation

`FacilityPartnerStaffingPolicyPeriod` is the historical Facility authorization that will later allow the partner Organization to manage personal assignments.

A current half-open period (`startsAt <= instant < endsAt`) means delegation is enabled. No current period means Facility-managed staffing. There is no boolean and no status enum.

Only a current Facility Administrator for that Facility may open or close a policy period. Closing the policy does not close partner role periods. Existing assignments stay valid. Partnership suspension remains the control that removes every partner user.

## User restriction

`FacilityPartnerUserRestrictionPeriod` is a historical Facility veto for one User under one partnership. It is keyed by `userId` and `facilityPartnerOrganizationId`. It does not require `PartnerUserFacilityAccess`, so a current Organization member can be blocked before any assignment exists.

A current restriction means this Facility forbids that User from personal partner access through this partnership.

The optional `note` is Facility-private administrative context. Organization-facing wording stays “Restricted by facility.”

## End access and Block

End access closes the current `PartnerUserRolePeriod` only. The user becomes unassigned and may be assigned again.

Block, in one partnership-locked transaction, closes a current role period when one exists and opens a restriction period. Path B is denied, and a later assignment is denied while the restriction is current.

Unblock closes the restriction period. It does not open an assignment. The user is eligible again and remains unassigned.

## Assignment authority provenance

Each `PartnerUserRolePeriod` records `createdByAuthorityKind` and, when closed, `endedByAuthorityKind`.

`facility_admin` stores a null Organization id. `partner_org_admin` will store the partnership Organization id as an immutable snapshot, not a cascading foreign key.

Rows that existed before this migration were written only by Facility Administrators. Creation authority is backfilled to `facility_admin`. Closed rows also receive `endedByAuthorityKind = facility_admin`.

Phase 2C1b-A accepts only `facility_admin` at runtime. Naming `partner_org_admin` does not enable that writer.

Policy and restriction periods use the same Facility provenance on create and end.

## Runtime

Path B requires that no `FacilityPartnerUserRestrictionPeriod` contains the requested instant for that user and partnership. A current restriction returns `NONE` even when a role period is still open. Historical resolution uses the same instant.

Staffing policy is not an authorization input. Disabling delegation does not remove Path B from someone who is still assigned.

These mutations do not increment `sessionVersion`. The next partner request sees Path B `NONE` after a block, and the existing partner exit path handles the session. Unblock does not restore a Facility session or an assignment. Enabling or disabling policy does not, by itself, change an active partner session.

## Default after migration

The migration creates zero current staffing-policy periods and zero restriction periods. Existing partnerships stay Facility-managed. Existing assignments, roles, ceilings, and Department scope are not closed or rewritten except for the provenance backfill.
