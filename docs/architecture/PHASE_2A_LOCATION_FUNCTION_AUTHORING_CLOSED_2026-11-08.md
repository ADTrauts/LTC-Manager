# Phase 2A — Location Function authoring closed

**Date:** November 8, 2026  
**Scope:** Close Location Function (and Operational Type / archetype) **authoring** writers and UI. Docs-only Phase 0/1 already committed (`a881e89`).  
**Out of scope (stop here):** schema drops, Work tab retirement, Job Flow rewrite, timeline, cron / Scheduled Evaluation host, reader removal (ARR-004).

---

## Outcome

| Item | Result |
|---|---|
| Locations UI bind/publish | **Closed** — `LocationFunctionsSection` removed from `locations-panel.tsx` |
| Server actions | **Closed** — all LF / OT / archetype actions in `actions.ts` return `LOCATION_FUNCTION_AUTHORING_RETIRED` |
| profile-service writers | **Closed** — adopt/bind/clear/publish + create/update archetype + bind/clear room binding + setArchetypeExperiences throw the same message |
| Write manifest | Reclassified those actions as `LEGACY` / `locationFunctionProfile` |
| Admin nav copy | Locations description no longer says “Location Functions” |
| ARR-026 | **Closed** (authoring) |
| ARR-029 | **Closed** (panel vs facility-composition authoring assertion reconciled) |
| ARR-004 | **Open** — schema + readers remain |

---

## What still exists (intentional)

- Prisma profile / archetype / binding tables and migrations (no drop)
- Readers and runtime resolvers that still load published function keys
- Catalog helpers (`resolveLocationFunctionAdoption`, Product Location Function lists)
- Draft-fork copy path inside `createNextDraftVersion` (Prisma clone only; no public writer)
- Work tab, Job Flow, cycles-builder “Location Functions” labels (later Phase 2 slices)
- `ensureWorkingDraftForPatterns` / certify / activate (lifecycle helpers; LF publish entry is fenced)

---

## Verification

Focused hermetic suite (Phase 2A + related):

- `phase-2a-location-function-authoring.hermetic.test.ts` — **pass**
- `location-function-binding.hermetic.test.ts` (Locations authoring assertion) — **pass**
- `locations-programming.hermetic.test.ts` — **pass**
- `phase-g-terminology.hermetic.test.ts` — **pass**
- `location-functions.hermetic.test.ts` (adoption writer retired) — **pass**
- `operational-type-publication.hermetic.test.ts` (rename writer retired) — **pass**

Known pre-existing failures (not Phase 2A regressions):

- `facility-composition.hermetic.test.ts` — reader/composition expectations (staffingNeeds / OT loaders); **panel authoring assertion now matches closed UI**
- `write-manifest.hermetic.test.ts` — unrelated unlisted `setEmployeeOperationalQualificationsAction`

---

## Next authorized slices (not started)

1. Retire Work authoring / nav (ARR-002 / ARR-015)  
2. Reader and schema debt for LF/profile (ARR-004) after writers stay closed  
3. Job Flow / OR / Records / Coverage place-id-only targeting  
