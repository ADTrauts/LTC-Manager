# Partner operational scope (Phase 2D1)

Date: 2026-10-08

Phase 2D1 adds the request-local boundary future partner surfaces will use. It does not open operational records.

## PartnerOperationalContext

`requirePartnerOperationalContext()` is the server entry for a partner Facility request. It requires a partner Facility session, reuses the request's live Path B result, and returns:

- Facility and partnership ids from that session
- assigned role, Facility ceiling, and effective role from Path B
- allowed Department ids that are still active at this Facility
- one active Department inside that set

An empty allowed set does not mean every Department. It fails the partner session and uses the existing `/partner/exit` recovery.

These values are not written to the JWT, the User, or the assignment.

## Allowed Departments

Allowed Departments are the live Path B scope for this partnership, intersected with active Department rows for the session Facility. The shell loads only those rows.

## Active partner Department

The active Department is a presentation choice. It is the partner cookie when that id is allowed. Otherwise it is the first allowed Department in canonical order: `Department.sortOrder`, then `Department.name`. That is the same order used by `src/lib/department-operations.ts`. The resolver does not write the cookie. An explicit switch action persists a validated id.

## Partner Department cookie

`ltc_partner_active_department` is the partner preference. `ltc_active_department` stays internal. A stale partner cookie cannot add a Department. Switching checks live Path B and does not change the internal cookie, `primaryDepartmentId`, or Employee membership.

## Partner capabilities

`canPartner(role, capability)` is the partner map. It does not use Facility `RoleKey` rank.

- Partner Viewer: `logs.read`
- Partner Operator: `logs.read`, `logs.submit`
- Partner Manager: those, plus `logs.correct`

`logs.correct` names a future capability. Phase 2D3 chooses which correction actions it covers. The map does not open a route.

## Phase 2D1 restriction

`/partner` remains the partner home. No operational route is partner-capable. Logs, Review, Dashboard, Today's Work, Assets, Employees, Locations, Menus, and Build stay internal.

Menus stay denied until they have canonical Department ownership. Employees stay denied. Assets and Today's Work stay deferred. Review stays deferred until its facts and spaces are Department-scoped. Canonical RUN Logs are the first operational surface, in Phase 2D2. ORG_ADMIN self-staffing stays deferred until Phase 2D2 and 2D3 are certified.
