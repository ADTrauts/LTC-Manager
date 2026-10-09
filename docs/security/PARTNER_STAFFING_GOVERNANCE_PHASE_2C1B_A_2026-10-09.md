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

A partner assignment is valid only while the User belongs to the partner Organization. Ending that membership, in the same transaction, closes every current `PartnerUserRolePeriod` for that User through every `FacilityPartnerOrganization` of that Organization. Other Organizations are left alone. The close does not depend on staffing delegation, and it does not matter whether the assignment was created by `facility_admin` or `partner_org_admin`. The assignment row and earlier role periods stay. No `FacilityPartnerUserRestrictionPeriod` is opened. A restriction that already exists stays current through membership end and a later rejoin, so reassignment remains `USER_RESTRICTED` until a Facility Administrator unblocks.

Demotion from `ORG_ADMIN` to `ORG_MEMBER` does not close assignments. The User is still a member.

Rejoining Organization membership opens a new membership role period only. It does not reopen Facility assignments. Client Access stays empty until a new `assignPartnerUser` creates another role period on the same assignment identity.

`PartnerUserRolePeriod.endReason` records why that period closed: `ROLE_CHANGED`, `ASSIGNMENT_ENDED`, `FACILITY_BLOCKED`, or `ORGANIZATION_MEMBERSHIP_ENDED`. Authority kind stays a separate fact. Periods closed before this column existed keep `endReason` null, which means the cause was not recorded. New application closures always write a reason. There is no database check tying `endsAt` to `endReason`, because those historical rows are closed without a reason.

Membership end locks the Organization row, rejects `LAST_ORG_ADMIN` before any close, locks that Organization's partnership rows in `id` order, re-reads membership and current assignments, closes those role periods with `ORGANIZATION_MEMBERSHIP_ENDED` at the same instant as the membership period, then closes the membership period. Provenance is the acting User, `partner_org_admin`, and the Organization id. `createFacilityPartner` takes the same Organization row lock before inserting `FacilityPartnerOrganization`. No application path deletes that partnership row; ending a partnership closes access periods and leaves the row. Assignment mutations lock the partnership only, so they do not deadlock with membership end.

The assignment transaction still re-reads Organization membership after locking the partnership. If membership end commits first, a later assignment is denied. If the assignment commits first, membership end closes it. Path B then fails closed. Losing `ORG_ADMIN` without leaving the Organization does not end a personal partner assignment.

One `sessionVersion` increment still happens after a membership end that requests session revocation. Closed Facility assignments do not each increment it.

## Organization Clients

`/organization/[organizationId]/clients` is the Organization-side staffing surface for a live `ORG_ADMIN` in an Organization session. It lists client Facility relationships for that Organization: Department scope, maximum partner role, whether the Organization may manage assignments, current assignments, and members the Facility has restricted. It is not a portfolio and does not show operational metrics.

My client access, on Organization Home, answers where the signed-in person can enter. Clients answers where the Organization has relationships and where an administrator may manage staffing.

Staffing actions call `assignPartnerUser`, `changePartnerUserRole`, and `endPartnerUserAssignment` with `partner_org_admin` authority taken from the signed Organization session. The form does not choose the Organization or the authority kind. `ORG_MEMBER` receives neither the page nor a successful action. There is no Organization control for block, unblock, Department scope, role ceiling, staffing delegation, or partnership suspension.

Facility restriction notes stay on the Facility admin view. The Organization payload says only that the member is restricted by the facility.

Rejoining Organization membership does not restore previous Facility assignments. The Clients page shows that person as a current member who is not assigned, and My client access stays empty until a new assignment.

Policy and restriction periods use the same Facility provenance on create and end.

## Runtime

Path B requires that no `FacilityPartnerUserRestrictionPeriod` contains the requested instant for that user and partnership. A current restriction returns `NONE` even when a role period is still open. Historical resolution uses the same instant.

Staffing policy is not an authorization input. Disabling delegation does not remove Path B from someone who is still assigned.

These mutations do not increment `sessionVersion`. The next partner request sees Path B `NONE` after a block, and the existing partner exit path handles the session. Unblock does not restore a Facility session or an assignment. Enabling or disabling policy does not, by itself, change an active partner session.

## Default after migration

The migration creates zero current staffing-policy periods and zero restriction periods. Existing partnerships stay Facility-managed. Existing assignments, roles, ceilings, and Department scope are not closed or rewritten except for the provenance backfill.
