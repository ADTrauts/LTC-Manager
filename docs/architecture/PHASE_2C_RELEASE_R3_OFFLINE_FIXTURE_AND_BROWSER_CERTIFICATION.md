# Phase 2C Release R3 — Offline fixture repair & browser certification

**Date:** November 8–9, 2026  
**R3 certification verdict:** **PASS WITH GAPS**  
**Release verdict:** **CONDITIONAL**  
**Nature:** Testing-infrastructure repair + minimal release-blocking offline gate fix. No deploy. No schema retirement. No Phase 2D.

---

## 1. Starting and ending SHA

| Item | SHA / state |
|---|---|
| Starting HEAD (R2 docs tip) | `004bdcfad3b647f9254eafbea465aa4fbdc8ee53` |
| Phase 2C / R1 release candidate (implementation) | `43e370b54e8bb8b2f826edf384dc8b2421b35ab5` |
| Ending state | Working tree on `004bdcf` with R3 fixture + offline gate fixes (uncommitted at report time) |
| Excluded | `.neon`, secrets, generated DB files |

**R3 requires a new release-candidate SHA** once these changes are committed (fixture + SPACE offline responsibility gate + client import / StatusBadge build fixes). R1 candidate `43e370b` alone is no longer sufficient for offline E2E claims.

---

## 2. Root cause of retired-authoring fixture coupling

`scripts/verify/canonical-offline-fixtures.mjs` still called:

1. `bindLocationFunction` / `publishLocationFunctionDraft` (Phase 2A retired)
2. `work.createDraft` / `publishWorkPlan` (Phase 2B retired)

Offline browser CI-gate preparation therefore failed before Playwright could run (`Location Function authoring is retired…`). This was a **verification tooling** failure relative to Phase 2A/2B, not evidence that ONE_OFF/offline sync product code was absent.

A second, **runtime** blocker was reproduced after fixtures were repaired: SPACE offline `authorize()` still required an ACTIVE Location Function room binding (`Publish an applicable Location Function before offline preparation.`). That gate could not be satisfied without reopening retired authoring.

---

## 3. Exact fixture modifications

| Area | Change |
|---|---|
| `scripts/verify/canonical-offline-fixtures.mjs` | Removed LF bind/publish and Work Plan draft/publish. Kept Facility structure CSV + `savePhysicalResponsibility`. Seeds Operating Rhythm PERIOD + KEY_TIME via `cycle-service`. Seeds actionable Work via `createOneOff`. Seeds isolated historical `WORK_PLAN` occurrence via Prisma (compatibility only). Soft-attaches Catalog Records when flag + published Catalog exist. |
| `tests/offline-browser/canonical-journey.ts` | `profileId` optional/null. Asserts published cycles instead of ACTIVE LF profile. Date-shift suites backfill OPEN ONE_OFF rows for the facility-local service date (disposable Prisma only). |
| `scripts/verify/run-offline-browser.mjs` | Optional `OFFLINE_BROWSER_PROJECT` to run tablet or chromium against an isolated disposable DB. |

No production login bypasses. Auth remains `SEED_DEMO_PASSWORD` + fixture accounts on disposable DB only.

---

## 4. Canonical replacement setup

Minimum fixture now defines:

- Facility (seed) + Floor / Neighborhood / Space (structure execute)
- Department responsibility (`Unit` + `UnitSpaceResponsibility`)
- Manager / worker / secondWorker employees + org sync
- Published Operating Rhythm (PERIOD + KEY_TIME + extras)
- Supervisor ONE_OFF occurrences (primary + extras for CI target-order coverage)
- Optional Log Attachment (when Catalog available)
- Isolated legacy WORK_PLAN occurrence (not advertised in new SPACE Work targets)

Does **not** fabricate overdue/uncovered/missed states from missing optional config. Uses facility Operational Time / service-date helpers for `effectiveFrom`.

---

## 5. Test database isolation and cleanup

| DB | Use | Cleanup |
|---|---|---|
| `ltc_verify_phase2c_r3` | Combined dual-project offline attempt | Dropped by orchestrator |
| `ltc_verify_phase2c_r3_cr` | Chromium-only CI-gate (PASS) | Dropped by orchestrator |
| `ltc_verify_phase2c_r3_sql` | Harbor + EVS SQL | Dropped after run |

Guardrails: `assertDisposableDatabaseUrl` refuses `ltc_manager`. Migrations applied only to disposable targets. Local `ltc_manager` not migrated. No Vercel/Neon production changes.

---

## 6. Offline CI-gate results

### Fixture preparation

**PASS** — no retired LF / Work Plan writers.

### SPACE offline runtime gate repair (release-blocking)

`src/lib/offline/space/service.ts`:

- Requires `UnitSpaceResponsibility` for Department + Space (not LF archetype binding)
- New Work targets omit `WORK_PLAN`; keep completed ONE_OFF rows for stable `data-target-order`
- Assignment digest uses responsibility identity

### Build blockers found while enabling the gate

| Fix | Why |
|---|---|
| `offline-job-flow-context.tsx` imports `serialize-offline` directly | Barrel import pulled `next/headers` into client bundle |
| Retired Work Plan detail `StatusBadge` children API | Production typecheck failed during `verify-build` |

### Playwright `@ci-gate` matrix

Unique scenarios: **18** (ci-gate + date-boundary + date-guard).

| Project | Result | Notes |
|---|---|---|
| **tablet** (iPad landscape viewport) | **18 / 18 PASS** (combined run attempt 4) | Full lifecycle including offline queue, sync once, conflict, expiry, capacity, unbind, Auckland/date boundary |
| **chromium** (desktop) | **18 / 18 PASS** (isolated disposable DB + `OFFLINE_BROWSER_PROJECT=chromium`) | Same scenarios after `.first()` locator fix for duplicate label after backfill |
| Combined dual-project shared DB | **Not reliable** | Tablet completion + shared ONE_OFF pool can cascade into chromium timeouts / duplicate labels. Documented isolation gap; certify via per-project disposable runs |

Certified lifecycle coverage (tablet and chromium, when isolated):

1. Authenticate test employee  
2. Load valid Space bundle after responsibility confirmation  
3. Canonical offline Job Flow / ONE_OFF Work + Key Time actuals  
4. Newly issued SPACE Work targets exclude WORK_PLAN  
5. ONE_OFF actionable offline  
6. Records attachment seeded when Catalog available (optional path)  
7. Plant WO offline completion not claimed  
8–16. Disconnect → queue → reconnect → sync → receipts → idempotent replay / conflict behavior exercised by CI-gate specs  
17. Historical WORK_PLAN occurrence seeded for compatibility store (not newly advertised)

---

## 7. Browser workflow results

| Area | Status |
|---|---|
| Offline SPACE employee lifecycle (tablet + desktop Chromium) | **Executed — PASS** (isolated projects) |
| Employee neighborhood/SPACE Job Flow beyond offline CI-gate | **Not executed** as separate suites |
| Supervisor ONE_OFF authoring UI suite | **Not executed** (fixture uses service `createOneOff`) |
| Dashboard / Harbor / partner interactive browser | **Not executed** this phase (Harbor SQL covers Marketplace WORK_PRESET omission) |
| Physical tablet hardware | **Not executed** — viewport only |

---

## 8. Authorization HTTP results

| Check | Result |
|---|---|
| CDA write-manifest hermetic | PASS (unchanged from R1) |
| Offline recover denied for other actor (403) | PASS inside CI-gate scenario-27 |
| Retired LF authoring not used by fixtures | PASS |
| Live HTTP unauthorized Department/location matrix beyond offline | **Not executed** |

UI hiding is not treated as authorization proof.

---

## 9. Desktop / tablet viewport results

| Viewport | Status |
|---|---|
| Playwright `iPad (gen 7) landscape` | PASS (18) |
| Playwright Desktop Chrome | PASS (18, isolated) |
| Physical tablet | Not claimed |

No duplicate-card / hydration claims beyond what CI-gate asserts.

---

## 10. Unique test counts (no double-count)

| Suite | Passed | Failed | Skipped | Not executed |
|---|---:|---:|---:|---|
| Focused Phase 2C hermetics (explicit file list) | 150 | 0 | 0 | — |
| Eligibility hermetic (ARR-008 carry-forward) | 10 | 3 | 0 | — |
| Harbor `console-catalog.db.test` (disposable) | 2 catalog cases in run + hermetics in file | 0 | — | — |
| EVS Phase 11C (hermetic + SQL on disposable) | 9 | 0 | 0 | — |
| Offline browser `@ci-gate` tablet | 18 | 0 | 0 | — |
| Offline browser `@ci-gate` chromium (isolated) | 18 | 0 | 0 | — |
| Broader employee/supervisor/dashboard Playwright | — | — | — | Not executed |

Eligibility **3 fail** unchanged from R2 (ARR-008). Not weakened.

---

## 11. Remaining ARR-008 debt

Carry forward (do not consolidate workforce roles in R3):

1. Suggestion helper eligibility-filter behavior — may need an explicit product decision even if the old test is outdated  
2. Retired CASHIER registry expectation  
3. Assignment Job Role derivation  

---

## 12. Actual runtime defects found

| Defect | Severity | Disposition |
|---|---|---|
| SPACE offline prepare required retired Location Function binding | **Release-blocking for offline E2E** | **Fixed** — responsibility gate |
| Client offline Job Flow imported server barrel (`next/headers`) | Build blocker | **Fixed** — direct serialize import |
| Retired Work Plan detail StatusBadge `label` prop | Build blocker | **Fixed** — children API |
| Dual Playwright projects sharing ONE_OFF occurrence pool | Test isolation | Documented; certify with `OFFLINE_BROWSER_PROJECT` + fresh disposable DB |

No new operational engine invented. No silent broadening into platform refactor.

---

## 13. Remaining release prerequisites

1. **Commit R3 changes** → new candidate SHA  
2. Explicit **deploy approval** (production still behind; not authorized here)  
3. ARR-003 remains open (ONE_OFF, historical readers, offline commands, Prisma Work persistence)  
4. ARR-008 product decisions deferred  
5. Optional: broader employee/supervisor/dashboard Playwright beyond offline CI-gate  
6. Do not drop Work/LF schema (LEG-06) without separate approval  

---

## 14. Recommended release and rollback plan

### Deploy (only after approval)

1. Commit R3 tree; tag candidate SHA  
2. Deploy app only (no Neon/Vercel config changes; no migration beyond already-applied history)  
3. Smoke: SPACE offline prepare on a facility with Department Space responsibility + ONE_OFF + published Operating Rhythm  

### Rollback

1. Redeploy prior candidate (`43e370b` / prior production SHA)  
2. R3 runtime delta is small (responsibility gate + import path + badge). Fixtures are verify-only.  
3. Do not reverse migrations  

### Stop line

**STOP after R3.** No deploy, no production data changes, no schema retirement, no Phase 2D without explicit approval.

---

## Success criteria checklist

| Criterion | Result |
|---|---|
| Fixture prep no longer calls retired LF / Work Plan writers | **PASS** |
| Fixture uses canonical operational owners | **PASS** |
| Test auth remains secure / disposable | **PASS** |
| Offline CI-gate executes real browser tests | **PASS** |
| ONE_OFF completion + sync verified | **PASS** (tablet + chromium isolated) |
| Legacy Work command receipt/conflict behavior retained in CI-gate | **PASS** |
| Authorization / isolation intact | **PASS** (within offline CI-gate) |
| No new production operational engine | **PASS** |
| Relevant regressions pass | **PASS** (focused hermetics + Harbor/EVS SQL) |
| No shared DB / deployment config modified | **PASS** |

**R3 certification:** PASS WITH GAPS (broader non-offline browser suites not run; combined dual-project isolation gap; ARR-008 / ARR-003 remain).

**Release:** CONDITIONAL — commit new candidate SHA; deploy still needs explicit approval.
