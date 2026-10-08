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

## Last Administrator Invariant

Normal Organization membership administration may never leave an active Organization without a current Organization Administrator.

Demotion and membership end of an `ORG_ADMIN` run inside a transaction that first takes `SELECT ... FOR UPDATE` on the Organization row, then recounts current administrator periods. The lock is mandatory. A client that cannot lock the row fails closed. Concurrent demotions serialize: one may succeed, and the other must fail with `LAST_ORG_ADMIN`. The final current administrator count stays at least 1.

Role changes and membership end increment `User.sessionVersion`. That signs the user out of every active session, including sessions for other Organizations. That global invalidation is the accepted Phase 2B tradeoff.

## Membership rejoin

Rejoining reuses the durable User↔Organization relationship and creates a new role period. Historical periods are not rewritten.

## Facility boundary

Organization membership, including Organization Administrator status, grants no Facility access.

Phase 2C1 records partner assignments separately. A valid assignment still does not create a Facility session.

## Tokens

`OrganizationMemberInvitation` stores SHA-256 only. Resend rotates the hash and expiry and invalidates the previous plaintext. Expiration is derived from `PENDING` + `expiresAt`. Delivery runs after the invitation transaction commits.

## Multi-organization

Login with one active membership opens that Organization. Multiple memberships open `/organization` so the user can switch. Switching re-issues an organization session after a server-side membership check and does not change `User.facilityId`.

```text
Organization membership grants zero Facility access.
```
