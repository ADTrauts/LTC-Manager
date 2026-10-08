# Organization Member Administration — Phase 2B3

**Date:** 2026-10-07

Organization claim (Phase 2B2) bootstraps the first `ORG_ADMIN` with Harbor approval.

Organization member invitation is how that administrator manages people afterward.

## Roles

| Role | May |
|------|-----|
| `ORG_ADMIN` | Invite `ORG_MEMBER` or `ORG_ADMIN`, resend/revoke invitations, change roles, end membership |
| `ORG_MEMBER` | Organization Home and own role. No membership administration |

Neither role grants Facility access, partner assignment, or Facility RoleKey.

## Last administrator

Normal administration cannot leave an active Organization with zero current `ORG_ADMIN`.

Demotion or membership end of the only current administrator is denied inside the membership transaction (`LAST_ORG_ADMIN`). If every administrator disappears through an abnormal path, derived claim state returns to `UNCLAIMED` and Harbor bootstrap may run again. An `ORG_MEMBER` is never auto-promoted.

Role changes and membership end set `revokeSessions: true`, which increments `User.sessionVersion` and signs the user out of active sessions, including unrelated ones. That is the current safe tradeoff.

## Tokens

`OrganizationMemberInvitation` stores SHA-256 only. Resend rotates the hash and expiry and invalidates the previous plaintext. Expiration is derived from `PENDING` + `expiresAt`. Delivery runs after the invitation transaction commits.

## Multi-organization

Login with one active membership opens that Organization. Multiple memberships open `/organization` so the user can switch. Switching re-issues an organization session after a server-side membership check and does not change `User.facilityId`.

```text
Organization membership grants zero Facility access.
```
