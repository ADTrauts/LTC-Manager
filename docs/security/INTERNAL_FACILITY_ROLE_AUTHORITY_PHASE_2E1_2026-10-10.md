# Internal Facility Role Authority — Phase 2E1

**Date:** 2026-10-10  
**Scope:** Move Path A Facility RoleKey from `User.roleId` onto historically effective `UserFacilityRolePeriod` rows.  
**Does not include:** login 0/1/many routing, `/account`, PIN, `Employee.userId`, public ids, cross-Organization Path A, Organization Portfolio.

---

## Global User

`User.id` is the person identity. Organizations, Facilities, roles, assignments, and sessions are relationships/context around that person.

## Internal Facility access

`UserFacilityAccess` is the internal relationship. Shared Organization membership never grants Facility access. Grants remain same-owning-Organization only.

## Internal Facility role

Current RoleKey is the open `UserFacilityRolePeriod` for that grant.

- Half-open: `startsAt <= instant < endsAt` (`endsAt` null = current)
- Exactly one current period per active grant
- Role change closes the current period and opens a new one in the same transaction
- History is retained; historical rows are not mutated except to set `endsAt`

## `User.roleId`

Compatibility / home-default only. Not canonical active Facility authority.

Hermetic proof: a session at Terrace View is authorized by the Terrace View period even when `User.roleId` has been drifted to another RoleKey.

## Home Facility

`User.facilityId` remains optional home/default. Switch and login do not rewrite it. Home is not a bypass: after backfill, home must have an explicit grant + current role period like every other internal Facility.

## Sessions

Internal JWT `role` is minted from `resolveCurrentInternalFacilityRole({ userId, facilityId })`.

Validation compares JWT `role` to the current selected-Facility period, not to `User.role.key`.

Stale-role sessions fail `ROLE_STALE` because validation reads the current period. A role-period change does not need a `sessionVersion` bump.

Grant revoke still increments `User.sessionVersion` and does not deactivate the User. Employee-linked role edits may still increment `sessionVersion` through the existing linked-user path.

Organization-only Users still cannot receive internal Facility grants in this phase (home-Facility User class). The role model does not require `User.roleId` to resolve once a grant exists.

## Separation

Internal Path A and partner Path B remain independent. A User may hold Terrace View Internal Manager and Terrace View via Metz Partner Manager at the same time. Permissions never merge.

## Known later work

- 2E2: `Employee.userId`; termination ≠ global User disable
- 2E3+: global `/account`, available-context resolver, My Access, 0/1/many login
- Later: User-owned PIN
