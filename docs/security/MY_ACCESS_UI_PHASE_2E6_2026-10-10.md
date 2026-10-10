# My Access UI — Phase 2E6

**Date:** 2026-10-10  
**Scope:** Canonical User-facing directory of current enterable contexts at `/access`.  
**Does not include:** login 0/1/many routing, shared context switcher, Leave workspace, global `/account`, last-used, favorites, PIN, Employee, Organization Portfolio.

---

## My Access

The User-facing directory of contexts they can enter right now.

```text
listAvailableContextsForRequest(uid)
  → presentAvailableContexts
  → grouped cards
Open → enterContext(contextKey)
```

The list is not authority. Open live-revalidates and mints an exclusive session.

## Route

`/access` remains `USER_SESSION`. Viewing does not call `enterAccountContext`. Current workspace stays selected so **Current** can render and browser Back returns to that workspace.

## Groups

```text
Organizations
Internal Facilities
Client Facilities
```

Empty groups are omitted. Zero contexts still render an active-account empty state.

## Current

`currentContextKeyFromSession` compares the exact context key. Account session → no Current row.

## Navigation

My Access is a link (`/access`) from the shared User menu on Internal, Organization, partner, and the global User layout. PIN does not see it. Partner **Return to Organization** is unchanged. Global profile lives at `/account` (Phase 2E8A) and is not a second chooser.
