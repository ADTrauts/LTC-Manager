# Onboarding Context Entry — Phase 2E7b

**Date:** 2026-10-10  
**Scope:** Reconcile signup, email verification, Facility account invite, Organization member invite, and Organization claim landings with canonical context entry.  
**Does not include:** password login, PIN, Harbor, password reset, Employee/User link session replacement, global `/account`, last-used context, Employee schema, Organization Portfolio.

---

## Permanent hierarchy

Authentication completion is not always global routing.

```text
Password login
→ routeAuthenticatedUser
→ 0 / 1 / many
```

```text
Explicit Facility/Organization creation or acceptance
→ enterGrantedContext(exactContextKey)
→ enterContext
```

```text
Identity-only linkage (Employee↔User)
→ preserve current session
```

`enterGrantedContext` does not list contexts. If the exact target is gone (`CONTEXT_NOT_AVAILABLE`), it mints an account session and `/access`. Identity failures (`USER_NOT_FOUND` / `USER_INACTIVE` / `SESSION_VERSION_STALE`) fail closed with no session.

---

## Signup

Creates Organization, Facility, User, grant, role period, and Employee. Home `User.facilityId` / `User.roleId` remain presentation/compat writes.

When mail is off or the User is already verified: `enterGrantedContext(facility_internal:<newFacilityId>)`. JWT role comes from the period. `nextPath` stays `/setup` while onboarding is incomplete.

When mail is on: no session; `/check-email`. Verification completes landing.

If creation committed and context entry then fails for identity or infrastructure reasons: facts stay; response is `{ ok: true, nextPath: "/login", sessionPending: true }`. No `User.roleId` mint and no grant repair.

---

## Email verification

Signup completion, not generic email confirmation.

- Passwordless (`passwordHash == null`): verify/consume the token, **no session**, `403 INVITE_PENDING`.
- Home Facility has a current grant: `enterGrantedContext` that Facility. `/setup` if onboarding is incomplete, otherwise the canonical home path.
- Home grant gone or no home: `routeAuthenticatedUser` (0/many → `/access`).
- Inactive User: no session.

Verification does not require `facilityId + roleId` and does not repair grants from `User.roleId`.

---

## Facility account invite

Password setup for a passwordless User created for one Facility. Grant already exists from issuance.

After password + verify writes: `enterGrantedContext(facility_internal:<homeFacilityId>)` using home only as the target selector. Period role. Canonical `redirectPath` (not `/dashboard`). Revoked grant → account `/access`. Existing password Users still cannot use this flow.

---

## Organization member invite and claim

Acceptance security is unchanged. After accept succeeds: `enterGrantedContext(organization:<id>)`. A multi-context User who accepts Metz enters Metz, not `/access`. TOCTOU after accept → account `/access`. Expired/revoked/wrong-email still fail before entry.

---

## Employee/User link

Still identity-only. Optional grant creation when the invite allows it. No session mint. The new context appears on My Access.

---

## Legacy helper

`resolveInternalFacilitySessionRole` is removed. Completion routes no longer call `ensureUserFacilityAccessGrant` to repair authority. Creation-time grant writes remain.
