# Dietary Employee Job Flow & Supervisor Operations Board — Phase 9B

**Date:** 2026-08-06  
**Product:** LTC Manager (not Vssyl)  
**Branch (target):** `product/dietary-job-flow-supervisor-board-phase-9b-2026-08-06`  
**Depends on:** Phase 9A Operational Cycles

## Purpose

Phase 9B turns published Operational Cycles, confirmed Assignments, Unit meal targets, Milestone confirmations, staffing/coverage risk, and offline sync state into a **derived Employee Job Flow** (odometer) and a focused **Dietary Supervisor Operations Board**.

Job Flow organizes authoritative facts. It does not become a competing source of truth.

## Architecture trace (summary)

| Concept | Finding |
|---------|---------|
| Job Flow persistence | **None** — no `JobFlowRecord`, no migration. Derived Runtime projection only. |
| Assignments | `OperationalAssignment` / Plan remain staffing authority. Draft plans stay non-frontline. |
| Operational Cycles | Phase 9A `DepartmentOperationalCycle` — published definitions; occurrences derived. |
| Meal targets | **`UnitMealTime`** remains authoritative per Unit + MealType. |
| Milestones | `ServeryMealServiceEvent` + append-only `ServeryMilestoneEntry`. Absence = Not Confirmed, not failure. |
| Coverage | Existing Assignment Board / coverage summary builders. |
| Offline | Phase 6A Runtime bundle; Job Flow adds read-only `jobFlowContext`. No offline Assignment edit. |
| Operations Engine | `OPERATION_ENGINE_ENABLED` stays **false**. |

## Ownership decision

| Concern | Owner |
|---------|-------|
| Where / when Employee is responsible | Operational Assignments |
| Phase of the Department day | Operational Cycles |
| Service target clock | UnitMealTime |
| What was confirmed | Servery Milestones |
| Staffing requirements met? | Coverage summary |
| Local / sync / conflict state | Offline Runtime |
| Now / next / progress / attention presentation | **Job Flow (derived)** |

Job Flow does **not** own Assignment, Schedule, Attendance, Cycle definitions, Meal targets, Milestones, Coverage, Offline commands, Conflicts, Procedures, or Log/Checklist requirements.

Employee acknowledgment of Assignment changes is **not** persisted in Phase 9B (revision indicator + refresh is enough).

## Derived-flow contract

Authoritative resolver: `resolveJobFlow` / `loadEmployeeJobFlow`.

**Top-level states:**  
`READY` | `NO_CONFIRMED_ASSIGNMENT` | `BEFORE_ASSIGNMENT` | `BETWEEN_ASSIGNMENTS` | `ACTIVE` | `ASSIGNMENT_COMPLETE` | `DAY_COMPLETE` | `NOT_CONFIGURED` | `NOT_APPLICABLE` | `REAUTHENTICATION_REQUIRED` | `OFFLINE_STALE`

Only Assignment-bearing states include Assignment data. Only cycle-bearing states include cycle data.

**CURRENT** — Assignment, Unit, Cycle, expectation, meal target, Milestone state, sync state.  
**NEXT** — next cycle / Assignment / milestone expectation and minutes until.  
**PROGRESS** — Upcoming / Current / Confirmed / Saved on This Tablet / Synchronizing / Review Required / Not Confirmed.  
**ATTENTION** — limited to what the Employee can understand or act on (Assignment updated, coverage risk, late/Not Confirmed, pending offline, conflict, session/device, missing config).

## Employee states (odometer)

Unit Workspace surfaces `data-testid=employee-job-flow` when `DIETARY_JOB_FLOW_ENABLED=true`.

Shows: Unit, duty, window, cycle, expectation, meal target, next event, progress phases, attention, offline strip. Neutral language; no gamification; Not Confirmed is not failure.

## Current expectation rules

| Cycle type | Expectation behavior |
|------------|----------------------|
| PREPARATION | Cycle description / guidance; Servery Ready as next when expected and not confirmed. |
| SERVICE | UnitMealTime target; Ready shown separately; Meal Service Started when not confirmed; factual confirmation when Started is recorded. |
| TRANSITION | Description + upcoming Assignment/cycle; no invented tasks. |
| CLOSEOUT | Description only; no invented cleaning/logs. |
| CUSTOM | Label + description only; do not infer tasks from the label. |

Free text is never parsed into automatic tasks.

## Assignment changes

Employees must distinguish original vs current confirmed Assignment (Unit / window / sequential / cancelled).

When Assignment changes after confirmation: neutral “Assignment updated” indicator, show current Assignment, preserve history, refresh offline bundle normally, label stale offline until sync.

Phase 9B does **not** persist acknowledgment.

## Supervisor Operations Board

Route: `/staffing/operations` (`data-testid=supervisor-operations-board`).

Header: facility, department, operational date, current/next cycle, plan status.  
Summary: scheduled / assigned / unassigned / call-offs / covered / at risk / uncovered / Ready confirmed / Ready Not Confirmed / Started / Started late / conflicts.  
Exception groups (order): Staffing → Coverage → Readiness → ServiceTiming → OfflineSync → Configuration.  
Exception-first temporal ordering; “View all Units” remains available.  
Actions navigate to existing certified workflows (Assignment Board, Unit Workspace, Department Builder) — no bypass mutations.

## Exception ordering

Urgent / current-cycle first; upcoming-cycle risks second; informational last. Temporal badges: Confirmed, Late, Current, DueSoon, NotConfirmed (neutral).

## Upcoming-cycle readiness

Board surfaces next-cycle context early enough to prepare (unassigned scheduled Employees, uncovered Units, missing configuration, Due Soon timing).

## Offline behavior

- Runtime bundle may include scoped read-only `jobFlowContext`.
- Offline Ready / Started retain “Saved on This Tablet” → synchronizing → accepted language.
- Job Flow offline strip may show last synced / pending / stale.
- No offline Assignment editing; no offline cycle editing; no offline auth changes.

## Authority

| Role | Own Job Flow | Supervisor Board | Manage cycles |
|------|--------------|------------------|---------------|
| STAFF / LEAD | Yes | No | No |
| SUPERVISOR | Yes | Yes (password) | No |
| MANAGER / GM | Yes | Yes | Yes |
| FACILITY_ADMINISTRATOR | Only with Dietary `primaryDepartmentId` | Same | Same — role alone denied |
| Quick PIN | Runtime Job Flow | Never | Never |

## Feature activation

```bash
DIETARY_OPERATIONAL_CYCLES_ENABLED=true
DIETARY_JOB_FLOW_ENABLED=true
OPERATIONAL_ASSIGNMENTS_ENABLED=true
OPERATION_ENGINE_ENABLED=false   # must remain off / empty
```

Defaults are safe (Job Flow off). Implemented in `src/lib/feature-flags.ts` as `isDietaryJobFlowEnabled()` (reads `DIETARY_JOB_FLOW_ENABLED`, default false).

## Performance

Supervisor Board targets ~12–17 SERVERY Units without inventing pagination. Prefer composing existing loaders; avoid N+1. Browser fixtures seed published cycles for speed.

## Browser scenarios

Harness: `npm run test:job-flow-browser`  
Config: `playwright.job-flow.config.ts` → `tests/job-flow-browser`  
Fixtures: `scripts/verify/job-flow-browser-fixtures.mjs` (disposable DB only; fixtures.json emails only; password from `SEED_DEMO_PASSWORD`; PIN in `pins.env`).

`tests/job-flow-browser/ci-gate.spec.ts` (`@ci-gate`) covers as many of the 38 certification scenarios as practical in-process, including Phase 9C regression coverage for scenarios **16, 17, 26, 27, 32, 33**. Scenarios **35–38** (existing assignment / offline / dietary-pilot / operational-cycles browsers remain green) are **out-of-band** — run those npm scripts separately.

### In-harness coverage (practical)

| # | Scenario | Coverage |
|---|----------|----------|
| 1–9 | PIN/password Job Flow, Assignment, cycle, expectation, meal target, next, progress | Covered |
| 4 | Draft Assignment not shown | Covered |
| 10–12 | Offline Ready Saved on This Tablet (+ reconnect soft) | Covered when meal controls enabled |
| 13–14 | Assignment change visible; history intact | Covered |
| 15 | No confirmed Assignment neutral | Covered |
| 16 | Missing cycle configuration is safe | Browser-verified (Phase 9C regression) |
| 17 | UTC browser resolves the same Job Flow | Browser-verified (Phase 9C regression) |
| 18–24 | Supervisor board, cycles, ~12–17 units, unassigned/call-off/uncovered/Ready Not Confirmed | Covered |
| 25 | Late Started | Soft via seeded lunch Milestone / exception text when cycle applies |
| 26 | Pending offline command appears | Browser-verified (Phase 9C regression) |
| 27 | Conflict appears with source navigation | Browser-verified (Phase 9C regression) |
| 28–29 | Exception source navigation | Covered (href assert) |
| 30–31 | STAFF / FA-without-Dietary denied | Covered |
| 32 | User change does not expose prior Job Flow | Browser-verified (Phase 9C regression) |
| 33 | Unit rebind does not retarget Job Flow | Browser-verified (Phase 9C regression) |
| 34 | Retired cycle not prospective | Covered |
| 35–38 | Sibling browser gates | Separate npm scripts |

## Known limitations (Phase 9B)

Phase 9B does **not** implement:

- Automatic task generation
- Full task checklist
- Unified Logs / Checklists / Inspections builder
- Operations Engine (`OPERATION_ENGINE_ENABLED` stays false)
- Automatic scheduling
- Offline Assignment editing
- Persisted Employee Assignment-change acknowledgment
- Generalized Supervisor platform beyond Dietary Operations Board
- EVS / Plant Operations productization

## Phase 9C boundary (indicative)

Richer evidence requirements tied to cycles, optional concurrent-cycle support, deeper offline Job Flow projection, and Assignment-change acknowledgment only if product needs prove necessary — without activating unfinished Operations Engine behaviors or inventing a task engine.

## Verification commands

```bash
env -u NODE_ENV npm run verify:static
env -u NODE_ENV npm run test:hermetic
env -u NODE_ENV npm run verify:build
# disposable PG16 only — never ltc_manager:
VERIFY_DATABASE_URL=… VERIFY_MANAGE_DATABASE=1 VERIFY_DATABASE_ADMIN_URL=… \
  env -u NODE_ENV npm run verify:db
npm run test:assignment-browser
npm run test:offline-browser
npm run test:dietary-pilot
npm run test:operational-cycles-browser
npm run test:job-flow-browser
```
