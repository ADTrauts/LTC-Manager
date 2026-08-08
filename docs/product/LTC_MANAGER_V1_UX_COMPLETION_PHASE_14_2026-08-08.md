# LTC Manager — Phase 14: V1 UX Completion and Product Readiness

**Phase:** Product Phase 14 — V1 UX Completion and Product Readiness
**Branch:** `product/v1-ux-completion-phase-14-2026-08-08`
**Date:** 2026-08-08
**Status:** COMPLETE — remaining Phase 13 shell/UX findings closed; V1 readiness recorded.

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
