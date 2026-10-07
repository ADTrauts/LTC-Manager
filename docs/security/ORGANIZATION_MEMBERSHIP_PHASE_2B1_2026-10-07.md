# Organization Membership Foundation — Phase 2B1

**Date:** 2026-10-07  
**Scope:** Nullable User home Facility / Facility RoleKey; Organization membership + role periods; facility vs organization sessions; Organization Home.  
**Does not include:** claiming (see Phase 2B2), member invitations (2B3), partner Facility user access (2C).

---

## Home vs active Facility

| Concept | Persistence |
|---------|-------------|
| Home Facility | `User.facilityId` (optional) |
| Active Facility | JWT `facilityId` when `scopeKind = facility` |

`switchActiveFacility` re-issues the session only. It does **not** rewrite `User.facilityId`.

Login prefers home Facility when still authorized; otherwise falls back to another Path A grant for **session** context without rewriting home.

---

## Session scopes

- `scopeKind = facility` — requires Facility RoleKey + active Facility authority (home or `UserFacilityAccess`)
- `scopeKind = organization` — requires current `UserOrganizationRolePeriod` for selected `organizationId`; no Facility RoleKey

Organization authority is re-checked server-side from membership periods, not trusted from JWT org-role claims (none are stored as RoleKey).

---

## Membership

- `UserOrganizationMembership` — durable User ↔ Organization identity
- `UserOrganizationRolePeriod` — half-open UTC role periods (`ORG_ADMIN` | `ORG_MEMBER`)
- Current period + `Organization.isActive` ⇒ active membership
- Join / promote / demote / end / rejoin preserve history

**Organization membership grants zero Facility access.**

---

## Session revocation tradeoff

Membership mutations may increment `User.sessionVersion` (caller opt-in). That invalidates all sessions for the User across Organizations — acceptable for Phase 2B1.
