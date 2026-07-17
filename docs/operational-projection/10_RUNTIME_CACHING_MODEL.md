# 10 — Runtime Caching Model

## Decision

Cache the **stable Projection snapshot** (and optionally ProjectionSource) by revision tokens. Do **not** key stable Projection on meal period, open issue counts, or AI state.

Early implementation may use **request-scoped memoization** only. Cross-request caching waits until revision tokens exist and invalidation is proven.

---

## What is cached?

| Layer | Cached content | Scope |
|-------|----------------|-------|
| L0 Request memo | Snapshot for identical request | Single request / RSC tree |
| L1 Source graph | ProjectionSource without principal | Per facility (+ revisions) |
| L2 Department projection | Snapshot pre-principal or per access class | Per facility+department+revisions+accessClass |
| L3 Purpose adapter view | Optional derived sidebar/workspace DTOs | Per L2 key + purpose family |
| Live overlays | Readiness, OC aggregates, AI briefs | Existing engine caches — **separate** |

Not cached as Projection:

- issue lists, log rows, asset rows;
- AI generated text (Intelligence cache);
- assignment fulfillment;
- operation instance phase (may be short-TTL elsewhere).

---

## Cache key material

```text
projectionCacheKey =
  facilityId
  + lensKey                          # departmentId | FACILITY
  + hierarchyRevision
  + assignmentRevision               # room↔department
  + profileRevision                  # ACTIVE profile version id(s)
  + bindingExceptionRevision
  + policyRevision                   # Plant policy version
  + principalAccessClass             # hash of role band + unit access set + permission class
  + purposeFamily
  + focusPhysicalKey?                # for focused workspace snapshots
```

### Access class

Do not put raw userId in every key if avoidable. Group principals that share identical Unit access + permission class. PIN locked tablets are their own class.

### Per-dimension guidance

| Dimension | Guidance |
|-----------|----------|
| Per room | Focused snapshots optional; prefer derive from department snapshot by index |
| Per department | Primary L2 key dimension |
| Per user | Only via access class; avoid unique per-user copies when class-identical |
| Per session | Optional L0; not authoritative |
| Per operation | **Forbidden** for stable Projection keys |
| Per facility | Always present |

---

## Invalidation

| Event | Invalidate |
|-------|------------|
| Hierarchy mutation | L1+L2 for facility |
| Assignment mutation | L1+L2 for facility (or affected departments) |
| Profile activation | L2 for facility+department; Facility lens composition |
| Binding/exception mutation | L2 for that department |
| Plant policy change | L2 for Plant + Facility lens |
| Permission / Unit access change | L2 keys for that access class |
| Vocabulary-only | Label patch or soft invalidate L3 |

Live overlay caches invalidate on their own engine rules — never by pretending Projection changed.

---

## Consistency rules

1. Stale Projection + fresh live data is acceptable briefly if scopes are supersets? **No** — stale scopes that are **broader** are unsafe. Prefer fail closed or revalidate on structural writes.
2. Stale Projection that is **narrower** is safer but may hide newly activated Experiences until refresh — acceptable with short TTL or explicit revalidate after admin activation.
3. After Department Administration activation, force revalidate for that facility+department.

---

## Materialization

**Do not** persist Projection rows as source of truth.

Optional future: materialized **read models** for large facilities, still derived and disposable, keyed by revisions — only after certification of invalidation. Not required for 15B–15F.
