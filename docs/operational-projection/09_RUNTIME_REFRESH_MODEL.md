# 09 — Runtime Refresh Model

## Decision

Distinguish **structural Projection rebuild** from **live overlay refresh**. Projection should not rebuild on every clock tick or every issue status change.

---

## Two clocks

| Clock | What changes | Response |
|-------|--------------|----------|
| **Structural** | Hierarchy, assignments, profiles, bindings, policy, principal access class | Invalidate / rebuild Projection snapshot |
| **Operational live** | Readiness, issues, logs, assets, inspections, operation phase, assignments fulfillment, AI caches | Refresh overlays; reuse stable Projection scopes |

---

## Rebuild triggers (structural)

Documented exhaustively:

| Trigger | Rebuild? | Notes |
|---------|----------|-------|
| Profile **activation** / retire previous ACTIVE | **Yes** | Hard invalidation for that facility+department |
| Profile certification alone (not activated) | No | Draft/certified inactive never drive Projection |
| Profile draft edits | No | Until activation |
| Room archetype **binding** change | **Yes** | Department+facility |
| Sparse room **exception** change | **Yes** | Narrow invalidation preferred |
| Facility Builder hierarchy change (add/move/retire room, floor, neighborhood) | **Yes** | Facility-wide hierarchy revision |
| Room↔department **assignment** change | **Yes** | Affected departments |
| Vocabulary change | **Presentation only** | May refresh labels without full Experience re-resolve; treat as cheap rebuild or label patch |
| Room physical classification change | **Yes** if it affects advisory→binding workflows; Projection uses bindings/policy, not raw classification as truth | Rebuild when bindings change |
| Experience catalog publish (new keys) | No until profiles adopt | Profiles reference keys; inactive until configured+activated |
| Plant policy version change | **Yes** | Plant lens facility-wide |
| User **role / permission** change | **Yes** for that principal access class | |
| Employee Unit access / PIN lock change | **Yes** for that principal | |
| User switches department **lens** | New request (different lens key) | Not invalidation of other lenses |
| User switches **facility** | New request; never blend | |
| **Assignment** create/update/complete | **No** for structural Projection | Overlay / ranking only |
| **Operation** phase change | **No** for structural Projection | Overlay |
| **Time** / meal period tick | **No** for structural Projection | Overlay via Operations Engine |
| Issue/repair/log/asset/inspection mutations | **No** | Live overlays |
| AI brief generate/cache | **No** | AI consumer cache separate |
| Feature flag toggles Experience availability | **Yes** or mark unavailable | Prefer explicit unavailable over stale emit |

---

## Overlay refresh triggers

Surfaces subscribe/poll/revalidate live data within projected scopes when:

- readiness recomputes;
- operation context changes;
- work records change;
- assignment coverage changes;
- AI cache updates (peek only where allowed).

Overlays must pass projected `queryScopes` — they must not widen fetch on refresh.

---

## Request lifecycle

```text
Page/request
  → resolve Projection (cache or rebuild)
  → pass scopes to loaders
  → overlay live engines
  → render
```

Server actions that mutate structural inputs must bump revision tokens so subsequent requests miss cache.

---

## Purpose of `asOf`

Tests may freeze time. Production Projection build uses facility “now” only for diagnostics timestamps — not for Experience eligibility (unless an Experience contract explicitly time-gates, which remains rare and declared).
