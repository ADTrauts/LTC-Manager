# LTC Manager — Phase 14: V1 UX Completion and Product Readiness

**Phase:** Product Phase 14 — V1 UX Completion and Product Readiness
**Branch:** `product/v1-ux-completion-phase-14-2026-08-08`
**Date:** 2026-08-08
**Status:** COMPLETE — remaining Phase 13 shell/UX findings closed; V1 readiness recorded.
**Certification:** **PHASE 14 — PASS WITH FINDINGS** (full V1 UX certification matrix green; see §7).
**Certified code SHA:** `205fa0606978d802744749ec2dcf43ffdc60fa2c` (Phase 14 feature commit; this record is a docs-only commit on top).

RUN / BUILD remains the canonical product model. ADMIN remains governance only. Product mode
stays a **presentation** projection over the platform route registry — never an authorization
boundary.

---

## 1. Purpose

Polish the Build/Run experience, close the remaining shell and responsive UX findings from
Phase 13, verify the complete first-use Build → Run journey, and prepare LTC Manager for a broader
V1 readiness review.

---

## 2. Phase 13 findings closed

| # | Phase 13 finding | Phase 14 outcome |
|---|------------------|------------------|
| 1 | **Dedicated BUILD hub** | New `/build` page (`src/app/(protected)/build/page.tsx`) composes the Build navigation group as cards. It is the Build mode segment's landing (registry nav order `200`, first Build item). Presentation-only projection reusing `platformNavItemsForRole` + `groupNavItemsByMode`; the hub lists only surfaces the role/department may already reach and never lists its own home link. Composition logic is unit-tested (`src/lib/build-hub.test.ts`). |
| 2 | **Explicit tablet viewport verification** | Product-shell browser gate scenario-14 exercises iPad landscape (1024×768) and portrait (820×1180): both mode segments, the RUN home, and the locations rail stay visible with no page-level horizontal overflow. |
| 3 | **Explicit offline-indicator verification** | New shell-level `ShellOfflineIndicator` (`src/components/offline/shell-offline-indicator.tsx`) in the app header, built on `useSyncExternalStore` over the browser `online`/`offline` events (SSR-safe, no network calls; renders nothing while online). Gate scenario-15 verifies it surfaces on a transient connectivity drop and clears on recovery. |
| 4 | **Explicit Floor → Unit → Room sidebar assertions** | Deterministic unit test (`src/lib/locations/sidebar-hierarchy.test.ts`) pins the Floor → Neighborhood → Room nesting, structural-vs-actionable presentation, room `?space=` href, and facility vocabulary labels. Gate scenario-16 asserts the real rail renders a defined state (projected nodes within the kind vocabulary, actionable → `/unit`, structural non-anchor, or the explicit empty state). |
| 5 | **Deprecated administration-menu / administration-nav cleanup** | Removed `administration-menu.tsx`, `administration-nav.ts`, `administration-menu-position.ts` and their tests (dead code, no live importers). `link-integrity` / `navigation` registry tests remain green. |

**First-use Build → Run journey** (gate scenario-17): RUN home → Build mode segment → `/build` hub →
open Department Builder → return to RUN → reach an operate-today surface.

---

## 3. What changed

**New**
- `src/app/(protected)/build/page.tsx` — BUILD hub page.
- `src/lib/build-hub.ts` (+ `.test.ts`) — hub card composition.
- `src/components/offline/shell-offline-indicator.tsx` — shell-level offline chip.
- `src/lib/locations/sidebar-hierarchy.test.ts` — Floor → Neighborhood → Room assertions.

**Changed**
- `src/lib/route-registry/platform-routes.ts` — registered `/build` (ROLE_RESTRICTED, SUPERVISOR floor; nav "Build Home", order 200).
- `src/lib/product-mode.ts` (+ `.test.ts`) — `/build` → BUILD, area label "Build Home".
- `src/lib/design-system/icons.ts` — `/build` → `operationalMode` icon.
- `src/lib/department-nav.ts` — `/build` classified as shared (department-scope safe).
- `src/components/app-shell.tsx` — render the offline indicator beside sign-out controls.
- `tests/product-shell-browser/ci-gate.spec.ts` — scenarios 13–17 (hub, tablet, offline, rail, journey).

**Removed**
- `src/components/navigation/administration-menu.tsx`
- `src/lib/administration-nav.ts` (+ `.test.ts`)
- `src/lib/administration-menu-position.ts` (+ `.test.ts`)

---

## 4. Verification

| Gate | Result |
|------|--------|
| `npm run test:hermetic` (unit suites) | **PASS** — 1478 pass / 0 fail / 93 skipped (SQL-backed). |
| `npm run lint` | **PASS** — no warnings/errors. |
| `npm run typecheck` | **PASS**. |
| `npm run test:product-shell-browser` (production build, disposable Postgres) | **PASS** — 17/17 (`@ci-gate`), including new scenarios 13–17. |

Product-shell gate ran against a disposable `ltc_verify_phase14` database on the local Postgres; the
database was dropped afterward. `ltc_manager` was never touched.

---

## 5. Constraints honored

- Hosted staging remains **deferred**; **no cloud spend** — all verification ran locally.
- `ltc_manager` untouched — the disposable-DB guard forbids it; verification used `ltc_verify_*`.
- `OPERATION_ENGINE_ENABLED=false` and `TASK_SYNC_ENABLED=false` unchanged; no dormant systems activated.
- **Zero schema migrations.** Migration count remains **72**. `/build` is derived URL/session state; no navigation tables.

---

## 6. Notes for the V1 readiness review

- **Dietary / EVS / Plant browser regressions were not re-executed this phase.** All Phase 14 changes
  are shell/navigation-only and additive: the offline indicator renders `null` while online (no
  operational-page impact), the removed code had no importers, and `/build` is a new additive route.
  These gates were green at Phase 13 and are unaffected; re-run them in CI for the formal readiness sign-off.
- **Empty projected rail for the seed manager.** The product-shell seed leaves the manager's locations
  rail as "No active locations." The Floor → Neighborhood → Room hierarchy is proven by the deterministic
  unit test; a future enhancement could seed a small Floor/Neighborhood/Room hierarchy so the browser gate
  also exercises a populated rail.
- **FA governance home** (a dedicated Admin landing for an FA without an operational relationship) remains deferred.

---

## 7. V1 UX Certification matrix (2026-08-08)

Full, sequential certification run (no concurrent gates) against the certified code commit
`205fa0606978d802744749ec2dcf43ffdc60fa2c`. All database-backed work used a **disposable local
PostgreSQL 16.13** instance (`ltc_admin@localhost:5433`, Docker container `ltc-pg16-verify`) with
per-gate `ltc_verify_*` databases created and dropped by the runners. `ltc_manager` was never a target.

**Git state at certification**

| Check | Value |
|-------|-------|
| `git branch --show-current` | `product/v1-ux-completion-phase-14-2026-08-08` |
| `git rev-parse HEAD` | `205fa0606978d802744749ec2dcf43ffdc60fa2c` (code) |
| `git rev-parse origin/<branch>` | `205fa06…` — local and remote matched |
| `git status` | clean tree, branch tracking origin |

**Static + unit + build + db (sequential)**

| Gate | Result |
|------|--------|
| `env -u NODE_ENV npm run verify:static` | **PASS** — test-discovery 149 files; migration-integrity **72 migrations**; repository-hygiene 1195 files; typecheck; lint; prisma validate. |
| `env -u NODE_ENV npm run test:hermetic` | **PASS** — 1478 pass / 0 fail / 93 skipped. |
| `env -u NODE_ENV npm run verify:build` | **PASS** — production (`--webpack`) build. |
| `env -u NODE_ENV npm run verify:db` (disposable PG16) | **PASS** — migrate deploy + double seed (idempotent) + schema assertions + SQL-backed suites: 1571 pass / 0 fail; disposable DB dropped. |

**Browser gates (sequential, disposable PG16, production build each)**

| # | Gate | Result |
|---|------|--------|
| 1 | `test:product-shell-browser` | **PASS** — 17/17 (`@ci-gate`), incl. Phase 14 scenarios 13–17. |
| 2 | `test:assignment-browser` | **PASS** — 6/6. |
| 3 | `test:offline-browser` | **PASS** — 25/25. |
| 4 | `test:dietary-pilot` | **PASS** — 5/5 (Dietary regression). |
| 5 | `test:operational-cycles-browser` | **PASS** — 6/6. |
| 6 | `test:job-flow-browser` | **PASS** — 13/13. |
| 7 | `test:operational-evidence-browser` | **PASS** — 10/10. |
| 8 | `test:asset-operations-browser` | **PASS** — 1/1. |
| 9 | `test:work-plans-browser` | **PASS** — 1/1. |
| 10 | `test:evs-browser` | **PASS** — 9/9 (EVS regression). First attempt aborted during fixture setup with a transient disposable-DB-creation error; **isolated re-run passed**. Classified as environmental contention, not a product defect (no product code changed). |
| 11 | `test:evs-assignment-browser` | **PASS** — 10/10. |
| 12 | `test:plant-browser` | **PASS** — 7/7 (Plant regression). |

**Phase 14 UX contracts (evidence)**

| Contract | Evidence | Result |
|----------|----------|--------|
| `/build` is the canonical BUILD landing | Registry EXACT route (nav order 200) + product-mode rule; gate scenario-13. | PASS |
| BUILD cards derive from the authoritative navigation projection | Page composes `platformNavItemsForRole` → `groupNavItemsByMode` → `buildHubCards`; `build-hub.test.ts`. | PASS |
| BUILD does not grant authorization | `/build` is `ROLE_RESTRICTED` (SUPERVISOR floor) in the registry; page guards defensively; cards are filtered from already-authorized nav only. | PASS |
| Quick PIN frontline cannot access BUILD | Gate scenario-09 (Quick PIN STAFF is RUN-only, no BUILD/ADMIN) + scenario-10 (direct URL stays server-authorized). | PASS |
| ADMIN remains governance-only | Gate scenario-02 (manager sees no ADMIN) + scenario-06 (FA sees ADMIN). | PASS |
| Offline shell indicator invisible online | `ShellOfflineIndicator` renders `null` while online; gate scenario-15. | PASS |
| Offline shell indicator visible offline | Gate scenario-15 (surfaces on transient drop). | PASS |
| Tablet landscape has no horizontal shell overflow | Gate scenario-14 (1024×768). | PASS |
| Tablet portrait has no horizontal shell overflow | Gate scenario-14 (820×1180). | PASS |
| Floor → Neighborhood / Unit → Room hierarchy preserved | `sidebar-hierarchy.test.ts` + gate scenario-16. | PASS |
| Structural location nodes expand rather than navigate | `sidebar-hierarchy.test.ts` (structural non-anchor) + scenario-16. | PASS |
| Actionable Room / Space nodes navigate correctly | Gate scenario-16 (actionable → `/unit/…?space=`). | PASS |
| Empty hierarchy states remain safe | Gate scenario-16 explicit "No active locations" branch. | PASS |
| Build → Run first-use journey succeeds | Gate scenario-17. | PASS |
| Deleted administration-menu / administration-nav have no live imports | Source scan clean across `src/` and `tests/`. | PASS |
| Legacy Surface Register reflects their removal | Register row marked REMOVED (Phase 14); `/build` recorded as active authority. | PASS |
| No new source-of-truth models introduced | Phase 14 commit changed no `prisma/` schema or migration files. | PASS |
| Migration count remains 72 | `migration-integrity` PASS (72). | PASS |
| `OPERATION_ENGINE_ENABLED=false` | Held empty by gate env; hermetic operation-engine suites skipped. | PASS |
| `TASK_SYNC_ENABLED=false` | Held empty by gate env. | PASS |
| `ltc_manager` untouched | Only disposable `ltc_verify_*` databases on the PG16 container were targeted. | PASS |
| No cloud resources | All verification local (Docker PG16 + localhost Next start). | PASS |

**Retained cross-phase findings** (genuine product boundaries, not unverified regressions):
- Empty projected locations rail for the seed manager — hierarchy proven by the deterministic unit test; populated-rail seeding is a future enhancement.
- FA governance home (dedicated Admin landing for an FA without an operational relationship) remains deferred.
- Hosted staging remains deferred (no cloud spend authorized).

**Certification result:** **PHASE 14 — PASS WITH FINDINGS.** The findings above are retained product
boundaries; the complete regression matrix is green.
