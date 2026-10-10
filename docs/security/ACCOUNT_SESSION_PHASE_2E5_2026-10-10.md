# Account Session + Neutral Context Entry — Phase 2E5

**Date:** 2026-10-10  
**Scope:** Neutral authenticated User state, exclusive context entry, and identity-versus-context recovery.  
**Does not include:** My Access chooser UI, 0/1/many login routing, shared shell switcher, global `/account` profile, PIN changes, Employee identity changes, Organization Portfolio, last-used context, a second identity cookie, or merged session authority.

---

## Global User Identity

Authentication may exist without a selected workspace. One `ltc_session` cookie holds exactly one of:

```text
account
organization
facility_internal
facility_partner
```

PIN remains a separate Employee-authenticated Facility session. Harbor remains a separate PlatformStaff identity plane. Context claims are never combined.

## Account Session

`scopeKind: "account"` + `authKind: "user"`.

The token is identity and display only:

```text
uid
name
email
sessionVersion
authKind
authMethod
scopeKind
```

It must not include `facilityId`, `organizationId`, `accessKind`, `role`, partner ids, or Department ids.

It is valid when the User exists, `User.isActive = true`, and `sessionVersion` matches. No context relationship is required. An active User with zero available contexts may remain signed in.

Factory: `createAccountSessionToken`. Validator: `validateSessionAuthority` account branch / `requireAccountSession`.

## Context Session

Exactly one Organization, internal Facility, or partner Facility context. Entry always live-revalidates the requested target and mints an exclusive replacement token.

## My Access

`/access` is the global User surface. Product name: **My Access**.

Route policy is `USER_SESSION`: any User-authenticated context may view it. PIN and Harbor may not. Viewing My Access does not require switching into an account session first. Phase 2E6 renders the certified context directory here.

`/account` is now the global User profile (`USER_SESSION`). See Phase 2E8A.

## enterAccountContext

Requires any User-authenticated identity, live-checks the User, mints an account session, replaces `ltc_session`, clears internal/partner Department cookies, and redirects to `/access`. This is not logout.

## enterContext

```text
parse context key
→ target-specific canonical live resolver
→ mint exclusive session
```

Client posts only `contextKey`:

```text
organization:<organizationId>
facility_internal:<facilityId>
facility_partner:<facilityPartnerOrganizationId>
```

Malformed keys → `INVALID_CONTEXT_KEY`. Live relationship missing → `CONTEXT_NOT_AVAILABLE`. Identity failures → `USER_NOT_FOUND` / `USER_INACTIVE` / `SESSION_VERSION_STALE`.

`enterContext` does not call `listAvailableContexts`. Posted role, Organization role, partner role, and Department ids are ignored. Source session kind is irrelevant.

- **Organization** — current membership + current role period + Organization active. Mint `createOrganizationSessionToken`. Redirect `/organization/<organizationId>`.
- **Internal Facility** — current grant + current role period + active RoleKey + Facility exists + owning Organization active. JWT `role` comes from the period, never `User.roleId`. No Employee required. Mint internal Facility JWT. Redirect `resolveDefaultHomePath`.
- **Partner Facility** — load the partnership, derive ids, run Path B `resolveFacilityAuthorization(..., accessKind: "partner")`. Mint `createPartnerFacilitySessionToken`. Redirect `/partner`. No source Organization session required.

Same Facility internal and partner remain separate contexts. Re-entering the current context revalidates and remints.

## Cookie cleanup

On any transition, `ltc_session` is replaced.

- `ltc_partner_active_department` clears unless reminting the exact same partnership and the Department is still allowed.
- `ltc_active_department` clears when leaving internal or entering internal from a non-internal source. Internal → internal may remap by canonical Department key.
- `ltc_device_facility` updates only when entering an internal Facility.
- Device unit cookies are preserved. Internal and partner Department cookies never copy across kinds.

## Identity vs Context Validity

**Identity validity:** signature, User exists, User active, `sessionVersion` current.

**Context validity:** Organization membership, or internal grant + period, or Path B.

These are not the same failure.

| Condition | Result |
|-----------|--------|
| Identity invalid | Clear auth → `/login`. Never recover to account. |
| Identity valid + context invalid | Mint account session → `/access`. |
| Internal grant current + JWT role stale | Remint the current internal role. If remint cannot occur, fall back to account. |
| Explicit `leavePartnerFacilityAction` | Unchanged: return to Organization session when that membership remains valid. |

PIN and Harbor are excluded from account recovery, `enterContext`, `enterAccountContext`, and `requireAuthenticatedUserSession`.

## Route policy

- `USER_SESSION` — `authKind: "user"` across account / organization / internal / partner. For global self-service surfaces such as `/access`.
- `ACCOUNT_SESSION` — `authKind: "user"` and `scopeKind: "account"`. Use only when the page specifically requires neutral state.

`AUTHENTICATED` stays Facility-gated (and the existing Organization account-module exception). It is not reused for My Access.

## Later work

- 2E6 — My Access UI (done)
- 2E7 — 0/1/many login routing
