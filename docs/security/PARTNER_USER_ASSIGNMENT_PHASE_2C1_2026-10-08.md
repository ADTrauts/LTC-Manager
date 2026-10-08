# Partner User Assignment — Phase 2C1

**Date:** 2026-10-08

Phase 2C1 records who a Facility has personally authorized under an external partnership. It does not let that person enter the Facility.

## Settled decisions

| Decision | Phase 2C1 |
|---|---|
| Facility Administrator assigns users | Yes |
| Partner Organization Administrator assigns users | No. Deferred to 2C1b. The same assignment service is the only writer. |
| Per-user Department subset | No. Assignments inherit the partnership's current Department scopes. |
| `PARTNER_MANAGER` Department Build | No. Deferred. |
| Facility-level asset access | No. Deferred. |
| Merging Path A and Path B privileges | Never. |
| Default Facility path when both exist | Internal. |
| Partner path | Must be requested explicitly. Session entry is Phase 2C2. |

## Partner role ceiling

`FacilityPartnerRoleCeilingPeriod` is the Facility-owned maximum external operational role for one partnership.

Half-open periods (`startsAt <= instant < endsAt`) do not overlap. Changing the ceiling closes the current period and opens another at the same instant. Clearing the ceiling closes the current period and creates no replacement. Historical periods stay intact.

No current ceiling means personal partner authorization is off, even when the partnership is active, Department scopes exist, and assignment periods are open.

The ceiling is not access. It only caps a person who is otherwise assigned.

## Partner user assignment

`PartnerUserFacilityAccess` is the durable User ↔ partnership identity. It has no current role and no Department list.

`PartnerUserRolePeriod` is the assigned role over time. An open period means currently assigned. Role changes close one period and open the next. Ending an assignment closes the period. A later assignment reuses the durable row.

## Assigned role and effective role

The period stores the role the Facility granted.

```text
effectiveRole = min(assigned role at instant, Facility ceiling at instant)
```

The rank is explicit: Viewer 1, Operator 2, Manager 3. Lowering the ceiling does not rewrite the assignment period.

## Department scope

Allowed Departments are the partnership's `FacilityPartnerDepartmentScope` periods that cover the instant, whose Department still belongs to the Facility and is active. An empty set is no partner authorization, not every Department.

There is no per-user Department ACL.

## Authorization paths

`resolveFacilityAuthorization` answers both paths and does not union them.

Path A uses the home Facility or `UserFacilityAccess` plus the Facility RoleKey. It does not read partner tables.

Path B requires, at the instant: active User, open assignment period, active partner Organization, current Organization membership for that Organization, open partnership access period, partnership not ended, open role-ceiling period, and at least one allowed Department. It does not read `User.facilityId`, `User.roleId`, `UserFacilityAccess`, Employee membership, or `primaryDepartmentId`.

`User.isActive`, `Organization.isActive`, and `Department.isActive` are current snapshots. They are not historical periods. A past instant still sees today's value for those three fields. Ceiling, assignment role, membership role, partnership access, and Department scope are versioned.

The default access kind is internal. Partner authorization is returned only when the caller asks for the partner path.

## Current limitation

A valid Path B result does not by itself mint a session. Phase 2C2 can mint a separate partner Facility session from an Organization session. That session is not an internal Facility session, `getSession()` still rejects it, and operational Facility loaders stay closed.

Assignment does not create `UserFacilityAccess`, a Facility RoleKey, or a home Facility.

Organization role does not determine partner role. An Organization Administrator may be a Partner Viewer. An Organization Member may be a Partner Manager.

Zero assigned users is valid. Ending a membership, suspending a partnership, or clearing a ceiling denies Path B without deleting assignment history.

The operator relationship is not an input.

## Deferred

- 2C1b: partner Organization Administrator staffing inside the Facility ceiling
- 2C2: partner Facility session and server revalidation
- 2C3: authorized client Facility entry
- 2D: Department filtering of operational loaders
- Phase 3: corporate portfolio
