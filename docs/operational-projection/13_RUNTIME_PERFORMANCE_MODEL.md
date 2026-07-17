# 13 — Runtime Performance Model

## Goals

- Sub-request Projection resolve cheap after warm cache.
- Large facilities (many rooms) must not N+1 profile resolution.
- Live overlays stay independent so issue storms do not thrash Projection cache.

---

## Preferred strategy (ordered)

1. **Batched ProjectionSource load** — one repository adapter call family per facility revisions.
2. **Pure in-memory resolve** — O(rooms × departments_in_lens) with indexes; Plant policy applied without writing rows.
3. **Request memoization** — identical purpose/lens within one RSC request shares snapshot.
4. **Revision-keyed L2 cache** — after invalidation tokens exist.
5. **Scoped parallel domain queries** — only projected IDs.
6. **Lazy panel data** — Unit Workspace may defer non-visible Experience fetches.
7. **Avoid materialized Projection persistence** until measured need.

---

## Complexity budget

| Step | Budget intent |
|------|----------------|
| Source load | Bounded queries; no per-room round trips |
| Profile resolve | Use Wave 14B pure resolver per room with shared profile snapshot in memory |
| Prune/index | Single pass build maps |
| Adapter DTO | Cheap map/filter |

Facility lens cost = sum of department resolves; cache per department then compose.

---

## What not to optimize prematurely

- Per-user unique Projection copies when access class identical.
- Caching live overlays inside Projection keys.
- Precomputing every purpose DTO if SIDEBAR and LOCATIONS can share tree.

---

## Performance diagnostics

Emit timing in diagnostics (debug): sourceLoadMs, resolveMs, roomCount, actionableCount, cacheHit. Use in shadow mode comparisons.

---

## Acceptance targets (implementation waves)

Targets are directional for later waves — not SLOs certified here:

- Warm L2 Projection resolve ≪ domain query time.
- Sidebar path does not load full meal/repair datasets.
- OC/Today load domains only for projected scopes.
