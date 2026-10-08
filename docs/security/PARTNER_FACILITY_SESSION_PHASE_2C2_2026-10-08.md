# Partner Facility Session (Phase 2C2)

Date: 2026-10-08

A partner Facility session is an explicit external Facility context. It is created only when an Organization session deliberately enters a current Path B assignment. It is not an internal Facility session.

```text
Partner Facility session ≠ internal Facility session
```

An internal Facility session still means `scopeKind = facility` plus a Facility RoleKey. Existing readers keep that meaning:

- `getSession()`
- `requireFacilitySession()`
- `createSessionToken()`
- `switchActiveFacility()`
- `isFacilityScopedSession()`

A partner token does not satisfy those guards. There is no helper that accepts either session.

## Partner JWT

The partner token identifies context only:

- `scopeKind = facility`
- `accessKind = partner`
- `authKind = user`
- `uid`, `name`, `email`, `sessionVersion`
- `facilityId`
- `partnerOrganizationId`
- `facilityPartnerOrganizationId`

It does not carry a Facility RoleKey, a partner role, Department ids, or `primaryDepartmentId`. Tokens issued before `accessKind` existed remain internal Facility sessions.

## Live authorization

Every protected partner request re-resolves Path B at the current instant:

1. Verify the signature and require `sessionVersion`.
2. Require an active User whose `sessionVersion` matches.
3. Call `resolveFacilityAuthorization` with `accessKind = partner` and the token's `facilityPartnerOrganizationId`.
4. Require a `PARTNER` result for that same partnership and partner Organization, with at least one Department.

`assignedRole`, `facilityRoleCeiling`, `effectiveRole`, and `allowedDepartmentIds` come from that result. Validation does not replace cookies, mint an Organization session, or redirect. If Path B fails, the proxy sends the browser to `/partner/exit`, which may restore the Organization session only when the signed partner Organization still has a current membership.

## Operational restriction

Phase 2C2 allows `/partner` only. That page shows the Facility name, partner Organization name, live effective role, and authorized Department names.

```text
A partner session does not make existing operational loaders safe.
```

Dashboard, Operations, Today's Work, logs, assets, employees, reports, Build, Admin, and billing stay internal. The active Department cookie is ignored. Direct partner-to-partner switching is not implemented. PIN and Harbor sessions cannot enter this context.

`sessionVersion` still changes when Organization membership role or membership end requires a global sign-out. Partner role changes, assignment end, partnership suspension, Department scope changes, and ceiling changes do not fan out `sessionVersion`. The next partner request sees the live Path B result.

## Partner session invalidation

Path B loss immediately invalidates the Facility context. A role downgrade or a narrower Department list does not. Removing the last Department, ending the assignment, suspending the partnership, or clearing the ceiling does.

The proxy sends that failed partner token to `/partner/exit`. It does not send the holder to `/dashboard` or treat the token as an internal Facility session. `/partner/exit` is public, so the recovery request is not sent back through partner validation.

## Recovery

A still-valid membership in the signed partner Organization may restore an Organization session for that Organization. Explicit leave uses the same transition while Path B is still valid, and the assignment stays in place for a later entry.

## Recovery authority

Recovery never trusts a client-supplied Organization id. It also does not treat the partner assignment as Organization authority. The candidate Organization is the signed `partnerOrganizationId`, and only after that id matches the partnership row. Current membership is loaded again before any Organization token is minted.

## Membership loss

If that Organization membership is no longer current, or the Organization is inactive, recovery clears `ltc_session` and ends at sign-in. It does not reconstruct the membership. An internal Facility token or an unsigned token cannot use this endpoint to mint an Organization session.
