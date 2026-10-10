# User ↔ Employee Identity Link — Phase 2E2

**Date:** 2026-10-10  
**Scope:** Formal `Employee.userId` link. Separate employment lifecycle from global User identity.  
**Does not include:** PIN ownership, login 0/1/many, `/account`, My Access, nullable User email, Organization Portfolio.

---

## User

`User.id` is the global person. Authentication, global security, Organization memberships, internal Facility access, and partner Facility access belong to User.

## Employee

Employee is the Facility workforce record: HR status, Departments/teams/jobs, roster, and PIN.

## Cardinality

```text
User 1 → Employee many
at most one Employee per User per Facility
```

Terminated Employees keep `userId`. Rehire reactivates the same row.

## Link

`Employee.userId` is the explicit identity link. Runtime email matching is not canonical.

Safe backfill requires unique email at the Facility, unique User email, and home Facility or an active internal grant at that Facility. Name is never used.

PIN-only Employees may remain unlinked.

## Employment termination

Ends that Facility's workforce relationship and, if linked, that Facility's internal grant.

Does **not** set `User.isActive = false`. Does not revoke other Facilities, Organization memberships, or partner assignments.

Independent grant revoke does **not** terminate Employee.

## Internal access

`UserFacilityAccess` is not employment. A User may have internal Facility access with no Employee.

## PIN

Still Employee-owned: `pinDigest`, `sessionVersion`, PIN JWT `uid = Employee.id`, `role = Employee.roleType`.

## `Employee.roleType`

PIN JWT role, Quick PIN eligibility, workforce/roster classification, and whether email/password onboarding is expected.

Not Path A password authority. That remains `UserFacilityRolePeriod`.

## Historical identity

Termination preserves `Employee.userId`. Operational actor rows keep their original `Employee.id` / `User.id`.

## Later work

- Every Employee eventually a User (blocked by required unique `User.email`)
- User-owned PIN
- Available Context Resolver (2E4)
- Global `/account` and context chooser
