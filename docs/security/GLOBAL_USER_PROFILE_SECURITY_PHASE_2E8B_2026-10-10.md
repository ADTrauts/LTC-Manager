# Global User Profile + Security UX — Phase 2E8B

**Date:** 2026-10-10  
**Scope:** Editable `User.displayName`, same-context remint, password copy, and Sign out everywhere.  
**Does not include:** email editing, PIN on User, MFA / SSO, last-used context, Home Facility, Employee merge, session inventory, Organization Portfolio.

---

## My Account

```text
My Access  = where I can work
My Account = who I am and how I sign in
```

`User.displayName` is global presentation identity. Employee names remain Facility workforce facts.

## Display-name change

```text
readAuthenticatedUserIdentity
→ update User.displayName
→ remintCurrentUserSession
→ certified cookies
→ stay /account
```

Validation: trim, min 1, max 120. No title-case, lowercase, or first/last split.

`displayName` is in `NON_REVOKING_CHANGES`. `User.sessionVersion` does not increment.

`remintCurrentUserSession` uses `currentContextKeyFromSession` then `enterContext` or `enterAccountContext`. It does not call `listAvailableContexts()`. Live role / Path B / membership are revalidated. If the workspace is gone, the name update still stands, an account session is minted, and `/account` shows **Profile updated.** plus **That workspace is no longer available.**

## Password change

Verify current password → new hash → `User.sessionVersion++`. Every User JWT dies, including this browser. PIN and Harbor do not.

Copy: *Changing your password signs you out of Vssyl on all devices, including this one.*  
Success: *Password changed. Please sign in again.*

## Sign out everywhere

```text
Sign out            = clear this browser's ltc_session
Sign out everywhere = User.sessionVersion++ + clear current cookie → /login
```

Uses `revokeOwnSessions({ kind: "user", id })`. Does not write `Employee.sessionVersion` or Harbor cookies. There is no session table and no device inventory.

## Boundaries

PIN Employee and Harbor / PlatformStaff cannot use `/account`. Global User security does not own PIN sessions.
