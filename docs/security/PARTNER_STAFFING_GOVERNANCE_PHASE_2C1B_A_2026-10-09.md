# Partner staffing governance — Phase 2C1b-A

Facility-controlled delegation and veto. A current Organization Administrator may manage the same assignment model only while a staffing-policy period is current.

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

`facility_admin` stores a null Organization id. `partner_org_admin` stores the partnership Organization id as an immutable snapshot, not a cascading foreign key.

Rows that existed before this migration were written only by Facility Administrators. Creation authority is backfilled to `facility_admin`. Closed rows also receive `endedByAuthorityKind = facility_admin`.

`assignPartnerUser`, `changePartnerUserRole`, and `endPartnerUserAssignment` are the only assignment mutations. Facility Administrator callers omit authority or pass `facility_admin` and do not need a staffing-policy period. `partner_org_admin` passes the signed Organization id. After the partnership row lock, that id must equal the partnership Organization, the actor must be an active current `ORG_ADMIN` of that Organization, and a staffing-policy period must contain the mutation instant. A partner operational role, including Partner Manager held by an Organization Member, is not staffing authority.

Organization-created and Facility-created role periods are the same assignment. Origin does not decide who may edit them and does not change Path B. While delegation is current, either writer may change or end the current role. Disabling delegation leaves those assignments in place and stops further Organization mutations. Facility Administrators can still change, end, and block them.

Organization administrators cannot enable or disable delegation, and they cannot block or unblock. A current restriction denies their assignment and role change. Only a Facility Administrator can unblock.

The assignment transaction re-reads Organization membership after locking the partnership. Membership rows are not locked by that same statement, so a membership end that commits on the other table can still race. Path B then fails closed because it reads the membership period at request time. Losing `ORG_ADMIN` does not end a personal partner assignment.

Policy and restriction periods use the same Facility provenance on create and end.

## Runtime

Path B requires that no `FacilityPartnerUserRestrictionPeriod` contains the requested instant for that user and partnership. A current restriction returns `NONE` even when a role period is still open. Historical resolution uses the same instant.

Staffing policy is not an authorization input. Disabling delegation does not remove Path B from someone who is still assigned.

These mutations do not increment `sessionVersion`. The next partner request sees Path B `NONE` after a block, and the existing partner exit path handles the session. Unblock does not restore a Facility session or an assignment. Enabling or disabling policy does not, by itself, change an active partner session.

## Default after migration

The migration creates zero current staffing-policy periods and zero restriction periods. Existing partnerships stay Facility-managed. Existing assignments, roles, ceilings, and Department scope are not closed or rewritten except for the provenance backfill.
