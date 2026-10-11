# Shared User Navigation + Global Account Route Ownership — Phase 2E8A

**Date:** 2026-10-10  
**Scope:** Shared lightweight User navigation and global `/account` / `/account/security` ownership.  
**Does not include:** email editing, stay-signed-in password remint, PIN on User, MFA / SSO, last-used context, inline context directory, Organization Portfolio. Display-name editing and Sign out everywhere are Phase 2E8B.

---

## Permanent surfaces

```text
My Access  = where I can work          /access
My Account = who I am and how I sign in /account
```

They stay separate. `/access` remains the only full context chooser.

## Shared navigation

Workspace shells reuse inner global User items:

```text
[Current context — display only]
My Access
My Account
Sign out
```

Current context uses `presentCurrentContextFromSession(session, already-loaded names)`. It does not call `listAvailableContexts()`.

Internal keeps Run / Build / Admin, Help & Support, and Unbind locally. Organization keeps `OrganizationSwitcher`. Partner keeps Return to Organization. PIN and Harbor do not see the global User menu.

`/access`, `/account`, and `/account/security` share `GlobalUserLayout`:

```text
Vssyl     My Access     My Account                    Sign out
```

## Route policy

`/account` and `/account/security` are `USER_SESSION`.

Allowed: account, Organization, internal Facility, and partner Facility User sessions.  
Denied: PIN, Harbor / PlatformStaff, signed-out.

Viewing My Account does not call `enterAccountContext()`. The current workspace stays selected.

## Profile

2E8A shipped read-only `User.displayName` and `User.email`. Phase 2E8B makes display name self-service. Email stays read-only. No Employee, Home Facility, Facility role, Organization role, or partner role fields.

## Security

Password change uses `requireAuthenticatedUserSession()` and `User.id` + `isActive`. No Facility condition.

```text
verify current password
→ set new hash
→ User.sessionVersion++
→ every User JWT is stale, including this browser
```

PIN sessions remain on `Employee.sessionVersion`. Copy says the change signs the User out on all devices, including this one.

## Ownership cleanup

`/account` is no longer a Facility AppShell / Admin hub / product-mode ADMIN surface.
