# Password Login Context Routing — Phase 2E7

**Date:** 2026-10-10  
**Scope:** Route successful email/password authentication by live available-context count.  
**Does not include:** PIN login, Harbor / PlatformStaff login, signup, email verification, Facility account invite completion, Organization member invite completion, Organization claim, Employee/User link invitation, global `/account`, last-used context, preferred/default context persistence, Employee identity, Organization Portfolio.

Those onboarding landings remain on pre-2E7 Facility/Organization mint behavior until **2E7b**.

---

## Authentication vs context routing

Password verification answers whether this User is who they claim to be.

Context routing answers where this User may work right now.

```text
credentials
→ authenticate global User
→ listAvailableContexts(userId)
→ 0 / 1 / many
```

```text
0 contexts  → account session → /access
1 context   → live enterContext → canonical destination
2+ contexts → account session → /access
```

The router does not classify Users as facility-native or organization-only. It does not invent authority from `User.facilityId` or `User.roleId`. Home remains presentation only.

## Post-auth router

`routeAuthenticatedUser` in `src/lib/post-auth-routing/` is a domain service. It uses only:

```text
listAvailableContexts
enterContext
enterAccountContext
```

List is discovery, not authority. A sole context is revalidated by `enterContext` before mint. The HTTP login route applies 2E5 cookie helpers to the landing; it does not mint tokens itself.

## Count contexts, not Facilities

Internal and partner at the same Facility are two contexts. Home plus a second internal Facility is two contexts. Organization plus partner is two contexts. No automatic preference exists yet.

## Fail closed vs recover

- Sole context disappears between list and enter (`CONTEXT_NOT_AVAILABLE`) → account session → `/access`.
- User becomes inactive, or `sessionVersion` is stale, after credential validation → no session.
- Resolver/database infrastructure failure → no session. Not interpreted as zero contexts.

## Password login security

Unchanged: rate limiting, email normalization, password hash verification, `User.isActive`, email verification, failed-login responses, `sessionVersion`, `lastLoginAt`.

Successful explicit password login always returns `redirectPath` and replaces `ltc_session`. It does not preserve a previous workspace because the browser was already signed in.

## `/login` bounce

An already-authenticated User hitting `/login`:

- account session → `/access`
- partner session → `/partner`
- Organization / internal Facility → existing canonical homes

## PIN and Harbor

PIN remains Employee / Facility / device authentication. Harbor remains PlatformStaff. Neither calls the User context directory or this router.

## Performance

`listAvailableContexts` still runs live Path B once per partner assignment. Typical one-internal Users have zero partner assignments, so login does not run Path B validations. Path B is not weakened to speed login.
