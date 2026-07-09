# Project Status

**Status:** Living document — update on wave completion  
**Date:** 2026-07-09  
**Last updated:** 2026-07-09 (STAB-001 stabilization audit)

---

## Executive summary

LTC Manager is a **production-usable MVP** with Waves **1–4** core complete, **Wave 5 Operations Engine v1** (schema + resolvers, behind `OPERATION_ENGINE_ENABLED`), **Wave 6 Readiness v0** (computed rules, shell + unit + supervisor surfaces), and **Design System foundation through VS-001** (operational UI polish).

**STAB-001 (2026-07-09):** Operational core automated checks pass (141/141 `tsx --test`). No regressions attributed to DS/VS work. **Release gate blocked** on incomplete department / Facility Administrator WIP (tracked shell imports reference modules not committed at `146e483`).

**Implementation readiness:** **YELLOW** — operational logic stable; **build/typecheck not green** until department-scope wave is committed or reverted.

**Highest priority:** Resolve build break (department / FA WIP), then **Wave 7 — Work Engine** (not started).

---

## Maturity snapshot

### Codebase maturity

| Area | Rating | Notes |
|------|--------|-------|
| Overall application | **MVP / Production-usable** | Core dietary operations shipped |
| Authentication | Production-ready | Email + PIN + device binding |
| Core operations (dietary) | Production-ready | Logs, menus, servery, staffing, Today's Work |
| Operations Engine | **Partial (v1 behind flag)** | Schema + resolvers; default off |
| Readiness | **Partial (v0)** | Computed rules; no formal aggregate |
| Design System | **Foundation complete** | DS-001–DS-008, VS-001 on operational surfaces |
| Platform foundations | Partial | No Task model; Operation engine flag-gated |
| Infrastructure | Partial | Local uploads; in-memory rate limit; no job queue |

---

## Modernization wave tracker

| Wave | Name | Status | Git milestone | Notes |
|------|------|--------|---------------|-------|
| 1 | Application Shell & Navigation | **Complete** | `22d36ab` … `ae81be1` | NAV-001–NAV-012 |
| 2 | Operations Center | **Complete** | `1225e53` … `9cb2cf7` | OPS-001–OPS-011 |
| 3 | Unit Workspace | **Core complete** | `b1fe7bb` … wrap-up | Queue-first + PIN flow |
| 4 | Supervisor & Today's Work | **Core complete** | `84c1590` … `4741b34` | Hub, walk, coverage, handoffs, call-down v0 |
| 5 | Operations Engine | **v1 complete (flagged)** | `343e79d` … `0b0db1f` | `OPERATION_ENGINE_ENABLED` default **off** |
| 6 | Readiness Engine | **v0 complete** | `664c52f` … `44db55f` | Computed rules; v1 deferred |
| — | Design System | **Complete through VS-001** | `08afc4b` … `146e483` | DS-001–DS-008 + visual stabilization |
| — | Stabilization | **STAB-001 complete** | `146e483` (audit) | No DS/VS regressions; build blockers documented |
| 7 | Work Engine | **Not started** | — | **NEXT after build green** |
| 8 | Issue & Recovery | Not started | | |
| 9 | Knowledge Layer | Not started | | |
| 10 | Operational AI | Not started | | |
| 11 | Organization & Multi-site | Not started | | |
| 12 | Industry Configuration | Not started | | |

### Wave 5 deliverables (v1, flag-gated)

- `OperationDefinition` + `OperationInstance` schema (`343e79d`)
- Active operation resolver + instance sync (`b6a0055`, `7c762cc`)
- Operations Center, Unit Workspace, and Today's Work header resolvers wired
- Operation-aware log and staffing query scoping
- Servery meal events linked to operation instances
- Feature flag: `OPERATION_ENGINE_ENABLED` (default **false**)

### Wave 6 deliverables (v0)

- `src/lib/readiness/` computed readiness rules (no new aggregate model)
- Site pulse on Operations Center; readiness in shell sidebar and unit/supervisor views
- Walk list and coverage use exception proxy where chips deferred

### Design System deliverables (DS-001 – VS-001)

| ID | Deliverable | Commit |
|----|-------------|--------|
| DS-001 | `lucide-react` | `08afc4b` |
| DS-002 | `AppIcons` registry | `08afc4b` |
| DS-003 | Design tokens | `08afc4b` |
| DS-004 | Nav + location iconography | `247dbd1` |
| DS-005 | `PageHeader` on operational screens | `d321046` |
| DS-006 | Operational UI primitives | `5a2580e` |
| DS-007 | Primitives adopted on operational surfaces | `94fc631` |
| DS-008 | `OperationalListRow` + list shells | `00cd300` |
| VS-001 | Visual stabilization (spacing, embedded banners, list shells) | `146e483` |

---

## STAB-001 stabilization audit (2026-07-09)

### Automated validation

| Check | Result |
|-------|--------|
| Operational tests (`npx tsx --test` all `*.test.ts`) | **141 / 141 pass** |
| ESLint (operational core surfaces) | **Pass** |
| Typecheck at `146e483` (clean tree) | **128 errors** — pre-existing incomplete department/FA integration |
| Typecheck (dirty tree + WIP) | **244 errors** — WIP extends schema/types not in committed Prisma client |

### Flow audit (automated RBAC + unit/today loaders)

| Flow | Status | Evidence |
|------|--------|----------|
| Manager `/dashboard` | **Pass** | `card-registry`, `build-dashboard-aggregates`, `wave1-rbac-regression` |
| Supervisor `/today` hub | **Pass** | `todays-work-rbac`, nav zones |
| `/today/walk` | **Pass** | `walk-list.test.ts` |
| `/today/coverage` | **Pass** | `coverage-list.test.ts` |
| `/today/handoffs` | **Pass** | `handoffs.test.ts` |
| Floor/PIN `/unit/[unitId]` | **Pass** | `unit-workspace-pin-flow`, `build-unit-work-queue` |
| Logs submit deep link | **Pass** | Work queue + scope-log-due tests |
| Servery ready/started | **Pass** | `resolve-servery-event-operation-instance` |
| Staffing deep links | **Pass** | `scope-staffing-queries`, `buildStaffingHref` patterns |

**Manual browser smoke:** Not run in STAB-001 (recommend `docs/operations-center-acceptance-checklist.md` + `docs/unit-workspace-pin-flow-checklist.md` before pilot).

### Regressions from DS/VS modernization

**None found.** All failures trace to incomplete department / Facility Administrator work-in-progress, not design-system commits.

---

## Typecheck failure taxonomy (STAB-001)

| Category | Count (approx.) | Blocking release? | Notes |
|----------|-----------------|-------------------|-------|
| Missing `facility-admin`, `active-department-context`, department libs at HEAD | ~20+ | **Yes** | `app-shell.tsx`, `staffing/page.tsx` import untracked modules |
| Department / FA schema drift (WIP vs committed Prisma) | ~150+ | **Yes** | `Department`, `RepairTrade`, `FACILITY_ADMINISTRATOR`, EVS unit types |
| Test fixture drift (`mealTimes` on `Unit` mocks) | ~5 | **No** | Tests pass at runtime; tsc on test files only |
| Operation prisma type-predicate in tests | ~3 | **No** | Tests pass |
| RBAC tests referencing `FACILITY_ADMINISTRATOR` before enum ships | ~5 | **No** (tests pass) | Becomes blocking when FA role commits without full migration |

---

## Known blockers

| Blocker | Impact | Resolution |
|---------|--------|------------|
| **Incomplete department / FA WIP** | `pnpm typecheck` and `next build` fail at HEAD | Commit or stash department wave; restore missing `src/lib/*` at HEAD |
| `OPERATION_ENGINE_ENABLED` default off | Operation instances not active in prod until flag + sync | Enable after `db:sync-operation-instances` verified |
| No Task model | Unified work inbox | Wave 7 |
| Single-facility assumption | Multi-site | Wave 11 |
| No background job runner | Missed logs, notifications | Wave 6 v1 |

---

## Capability alignment (post STAB-001)

| Capability | Status |
|------------|--------|
| CAP-01 Operation Readiness | **Partial** — v0 computed readiness shipped |
| CAP-02 Operation Execution | **Partial** — operation engine v1 behind flag |
| CAP-03 Workforce and Coverage | **Production-ready** + Today's Work |
| CAP-04 Issue and Recovery | Partial (repairs only) |
| CAP-05 Asset and Location | Production-ready |

---

## Change log

| Date | Change |
|------|--------|
| 2026-07-07 | Implementation program created; Wave 1 prioritized |
| 2026-07-08 | Waves 1–4 core complete |
| 2026-07-09 | Wave 5 v1 (operations engine, flagged); Wave 6 v0 (readiness) |
| 2026-07-09 | Design System DS-001–DS-008 + VS-001 (`08afc4b` … `146e483`) |
| 2026-07-09 | **STAB-001** stabilization audit — operational tests green; build blockers documented |

---

## Next action

1. **Unblock release gate:** Finish and commit department / Facility Administrator scope **or** revert shell imports to last green integration — do **not** ship partial references at HEAD.
2. Re-run `pnpm typecheck`, `NODE_ENV=production pnpm build`, and full `npx tsx --test` on green tree.
3. Manual acceptance: Operations Center + Unit PIN checklists.
4. **Then** begin Wave 7 — Work Engine per modernization roadmap.

**Do not start Wave 7 until build is green.**
