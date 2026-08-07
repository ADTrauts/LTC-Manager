# Dietary Department Work Plans — Phase 11A

**Date:** 2026-08-06  
**Branch:** `product/department-work-plans-phase-11a-2026-08-06`  
**Base tip:** `c5d264c67738fc4978a5f347b36eba3366c30596` (Phase 10A)  
**Mode:** ACT — PRODUCT PHASE 11A

See also:

- [`DIETARY_DEPARTMENT_WORK_PLANS_PHASE_11A_OWNERSHIP_2026-08-06.md`](./DIETARY_DEPARTMENT_WORK_PLANS_PHASE_11A_OWNERSHIP_2026-08-06.md)
- [`DIETARY_DEPARTMENT_WORK_PLANS_PHASE_11A_SCENARIO_CLASSIFICATIONS_2026-08-06.md`](./DIETARY_DEPARTMENT_WORK_PLANS_PHASE_11A_SCENARIO_CLASSIFICATIONS_2026-08-06.md)
- [`DIETARY_WORK_PLAN_MANAGER_GUIDE.md`](./DIETARY_WORK_PLAN_MANAGER_GUIDE.md)
- [`DIETARY_EMPLOYEE_WORK_GUIDE.md`](./DIETARY_EMPLOYEE_WORK_GUIDE.md)
- [`DIETARY_SUPERVISOR_WORK_GUIDE.md`](./DIETARY_SUPERVISOR_WORK_GUIDE.md)

## Purpose

Deliver Dietary Department Work Plans as a coherent product surface:

Work Plan Builder → derived Work Requirements → sparse Occurrences →  
Job Flow Work strip → Supervisor Work exceptions → Offline completion

Wave-era `Task` dual-write and Operations Engine remain isolated (`OPERATION_ENGINE_ENABLED=false`, `TASK_SYNC_ENABLED=false`).

## Architecture summary

| Question | Answer |
|----------|--------|
| Authoritative Work Plan | New `DepartmentWorkPlan` + `DepartmentWorkItem` (not Wave `Task`) |
| Derived expectation | `WorkRequirement` — computed, not persisted |
| Sparse runtime state | `DepartmentWorkOccurrence` + append-preserving `DepartmentWorkEvent` |
| Procedures | `KnowledgeArticle` — viewing ≠ completion |
| Job Flow / Supervisor Board | Projection only |
| Offline completion | `COMPLETE_OPERATIONAL_TASK` (scoped, idempotent) |
| Why not reuse Wave Task | Projection of other sources; lacks plan versioning / cycle applicability / responsibility modes; would imply `TASK_SYNC` / engine coupling |

## Canonical ownership

| Concept | Owner |
|---------|--------|
| Versioned Work Plan / Items | `DepartmentWorkPlan` / `DepartmentWorkItem` |
| Derived expectation | `WorkRequirement` (not persisted) |
| Sparse runtime state | `DepartmentWorkOccurrence` + `DepartmentWorkEvent` |
| Procedures | `KnowledgeArticle` (viewing ≠ completion) |
| Assignment | Who/where/when — never work steps |
| Evidence | Optional `LINKED_EVIDENCE` completion; no duplicate truth |
| Milestone | Independent of Work completion |
| Asset / Issue / WO | Adjacent; Work may reference Asset context without owning Asset lifecycle |
| Job Flow / Supervisor Board | Projection only |
| Offline completion | `COMPLETE_OPERATIONAL_TASK` |

## Work Plan contract

- Facility + Department scoped; Dietary primary for Phase 11A
- `stableKey` + immutable published `version`
- Status: `DRAFT` → `PUBLISHED` → `RETIRED` (supersede retires prior published of same key)
- Applicability: Units / optional Spaces; cycle or fixed-window timing on items
- Presets seed drafts only — never auto-publish

## Work Item contract

- `itemKey` stable within a plan version
- Timing: Operational Cycle window or once-per-day / fixed window
- Responsibility: Phase 11A Runtime = `UNIT_SHARED` (`EACH_ASSIGNED_EMPLOYEE` reserved, not recurring Runtime)
- Completion: `EXPLICIT_CONFIRMATION` or `LINKED_EVIDENCE`
- Optional: priority, roleKeys, Procedure (`knowledgeArticleId` + title snapshot), Evidence template link, Asset context

## Responsibility model

- Confirmed Assignments only; draft plans never create frontline Work
- Unit-shared: eligible Employees on the Unit see the same occurrence; first valid completion satisfies it
- Occurrence-level reassignment does not mutate Operational Assignment
- One-off may optionally target a specific Employee

## Scheduling model

- Requirements are **derived** for the operational date
- No pre-generation of months of future occurrences
- No automatic Assignment generation

## Completion modes

1. **EXPLICIT_CONFIRMATION** — Employee confirms; event + occurrence state
2. **LINKED_EVIDENCE** — Accepted Evidence record satisfies Work; pending local Evidence → `SAVED_ON_THIS_TABLET`; rejected/conflict Evidence does not complete Work

Milestone confirmation is **not** a Work completion mode. Procedure viewing is **not** completion.

## Product surfaces

- **Builder:** `/staffing/work-plans` (MANAGER+)
- **Job Flow:** Work requirements strip + completion panel (`?work=`)
- **Supervisor Board:** Work exception group + one-off / Not Required / Reopen / reassign
- **Offline:** `workContext` in Runtime bundle + `COMPLETE_OPERATIONAL_TASK`

## Neutral language

`PAST_DUE_NOT_CONFIRMED` means past due and not confirmed — it does **not** prove work did not occur.

## Feature activation

```env
DIETARY_OPERATIONAL_CYCLES_ENABLED=true
DIETARY_JOB_FLOW_ENABLED=true
DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
DIETARY_ASSET_OPERATIONS_ENABLED=true
DIETARY_WORK_PLANS_ENABLED=true
OPERATION_ENGINE_ENABLED=false
TASK_SYNC_ENABLED=false
PROJECTION_UNIT_WORKSPACE_ENABLED=false
```

Default for `DIETARY_WORK_PLANS_ENABLED` is **false**.

## Database

Migration: `20260807010000_dietary_department_work_plans_phase_11a`  
Additive only. Never apply to `ltc_manager`. Disposable PostgreSQL 16 only.

## Performance

Designed for ~17 serverys, one published Dietary plan with a modest item set, and sparse occurrences only when acted on. Loaders reuse Assignment / cycle / Job Flow patterns; no Redis or background materialization of Work Requirements.

## Legacy boundaries

- Wave `Task` dual-write remains flag-gated off (`TASK_SYNC_ENABLED=false`)
- Operations Engine remains off (`OPERATION_ENGINE_ENABLED=false`)
- `/today` Todays Work and Operations Engine routes are not activated by Phase 11A
- Pre-existing Asset / Evidence / Assignment / Cycle product surfaces unchanged in ownership

## Phase 10A Finding Closure Matrix

| # | Finding | Disposition | Evidence classification | Exact evidence |
|---|---------|-------------|------------------------|----------------|
| 1 | Projected Unit Workspace lacks classic Asset panels | **RETAINED WITH CLASSIFICATION** | DOCS / HERMETIC | `PROJECTION_UNIT_WORKSPACE_ENABLED` defaults **false** (`feature-flags.ts`, hermetic tests). Classic `/unit/[unitId]` remains the supported Runtime path. Projected path is not an active supported Runtime under current flags — Asset panel parity intentionally not duplicated. |
| 2 | Full Work Order lifecycle not completely browser-click verified | **CLOSED** (strengthened) / residual SQL for status steps | BROWSER + SQL | `tests/asset-operations-browser/ci-gate.spec.ts`: Issue → Create WO → open linked WO detail (BROWSER). Status transitions `IN_PROGRESS` → `WAITING_ON_VENDOR` → `COMPLETED` + no auto-return + explicit `RETURN_TO_SERVICE` asserted via Prisma (SQL). Residual: not every WO status is driven solely by UI click. |
| 3 | Foreign Vendor rejection is service/SQL rather than full UI browser | **RETAINED WITH CLASSIFICATION** | SERVICE / SQL + BROWSER SELECTOR SCOPE | Facility-scoped Vendor selector in WO UI (BROWSER SELECTOR SCOPE). Foreign facility Vendor ID rejection retained in asset service / `phase-10a-asset-operations.test.ts` (SQL/SERVICE). Not relabeled as full browser proof of foreign-ID reject path. |
| 4 | Quick PIN Asset Issue reporting not browser-click verified | **CLOSED** | BROWSER | Strengthened in `tests/work-plans-browser/ci-gate.spec.ts` (`reportAsset=1` → `asset-issue-report-panel` → submit → notice) and covered in asset-operations browser gate Issue report path. |
| 5 | Evidence ↔ Asset Issue deep-link only partially browser verified | **CLOSED** (where product supports) | BROWSER + SERVICE | Asset browser: link Evidence ID on Issue → `issue-evidence-links`; navigate to `/staffing/log-book/[id]` evidence detail. Reverse Issue links from Evidence retained where Log Book surfaces them. Honest: only exercised when a completed Evidence record exists in fixtures. |
| 6 | Dietary workspace quick-action catalog omits `/assets` | **CLOSED** | HERMETIC | `workspace-composition.ts` Dietary `quickActionIds` / `operationsLinkIds` include `"assets"`. Asserted in `business-workspace.test.ts` (“Dietary quick actions include /assets…”). |

## Explicit non-goals

Automatic scheduling, automatic Assignment generation, Task dual-write activation, Operations Engine, EVS/Plant implementation, generic PM/Todo/Kanban, AI task generation, hosted staging, PHI.

## Future EVS applicability

`EACH_ASSIGNED_EMPLOYEE` is reserved on the Work Item responsibility enum. Phase 11A Dietary Runtime does **not** activate recurring each-employee derivation. EVS can later publish Department Work Plans with that mode without reusing Wave Task.

## Phase 11B boundary (suggested)

Richer Procedure version lineage, EACH_ASSIGNED_EMPLOYEE Runtime for EVS, fuller WO status UI click-through, projected-workspace Asset parity if/when projection is activated, and optional deeper Evidence↔Work browser matrix.

## Known limitations

- `EACH_ASSIGNED_EMPLOYEE` deferred for recurring Dietary plans
- KnowledgeArticle lacks immutable version lineage (title snapshot at link/completion)
- Foreign Vendor foreign-ID reject remains SERVICE/SQL (selector scope is browser)
- Projected Unit Workspace Asset panels retained (flag default false)
- Some WO lifecycle status steps remain SQL-asserted rather than pure UI click

## Local verification

```bash
source .local-staging/verify-pg16.env
env -u NODE_ENV npm run verify:static
env -u NODE_ENV npm run test:hermetic
env -u NODE_ENV npm run verify:build
VERIFY_MANAGE_DATABASE=1 DATABASE_URL=$VERIFY_DATABASE_URL DIRECT_URL=$VERIFY_DATABASE_URL \
  env -u NODE_ENV npm run verify:db
# browser gates SEQUENTIALLY on disposable VERIFY DB (do not parallelize):
npm run test:assignment-browser
npm run test:offline-browser
npm run test:dietary-pilot
npm run test:operational-cycles-browser
npm run test:job-flow-browser
npm run test:operational-evidence-browser
npm run test:asset-operations-browser
npm run test:work-plans-browser
```

## Final sequential verification record (2026-08-07)

Authoritative tip at verification:

- Branch: `product/department-work-plans-phase-11a-2026-08-06`
- Full SHA: `494f115b0543a602aeb6dc5622001f8e97108e5b`
- Local and `origin/product/department-work-plans-phase-11a-2026-08-06` identical before verification
- Migrations: **70**
- `OPERATION_ENGINE_ENABLED=false`
- `TASK_SYNC_ENABLED=false`
- `ltc_manager` untouched
- No cloud resources
- Disposable VERIFY DBs recreated/dropped per gate; leftover multi-agent VERIFY DBs cleaned after the matrix

Commands run **sequentially** (one at a time; no concurrent Next builds / Playwright / VERIFY jobs):

| # | Command | Result | Totals / notes |
|---|---------|--------|----------------|
| 1 | `verify:static` | **PASS** | Discovery 141 files; migration-integrity 70; typecheck+lint+prisma validate |
| 2 | `test:hermetic` | **PASS** | 1515 tests; pass 1435; fail 0; skipped 80 (hermetic-only skips) |
| 3 | `verify:build` | **PASS** | Production build; `BUILD_ID=odJ8wCFH4kuzXDU2w5EHc` |
| 4 | `verify:db` | **PASS** | 1515 tests; pass 1515; fail 0; **skipped 0**; disposable DB dropped |
| 5 | `test:assignment-browser` | **PASS** | 6 passed |
| 6 | `test:offline-browser` | **PASS** | 25 passed |
| 7 | `test:dietary-pilot` | **PASS** | 5 passed |
| 8 | `test:operational-cycles-browser` | **PASS** | 6 passed |
| 9 | `test:job-flow-browser` | **PASS** | 13 passed (prior late-night contention flakes **not** reproduced) |
| 10 | `test:operational-evidence-browser` | **PASS** | 10 passed (prior user-change flake **not** reproduced) |
| 11 | `test:asset-operations-browser` | **PASS** | 1 passed |
| 12 | `test:work-plans-browser` | **PASS** | 1 passed; isolated `distDir=.next-workplans-browser` |

Isolated reruns: **none required** — every gate passed on the first sequential attempt.

Environmental contention findings: Earlier multi-agent sessions recorded job-flow (2) and evidence (1) failures under concurrent VERIFY / `.next` contention. This clean sequential matrix did not reproduce those failures; they are classified as **environmental**, not product defects.

Phase 10A finding closure matrix above is **unchanged** (no silent promotion of SERVICE/SQL to BROWSER).

### Certification recommendation

**PHASE 11A — PASS WITH FINDINGS**

Retained findings remain: projected Unit Workspace Asset panels (flag default false); Foreign Vendor foreign-ID reject SERVICE/SQL (+ BROWSER SELECTOR SCOPE); residual WO status steps SQL. Closed findings remain closed as documented.