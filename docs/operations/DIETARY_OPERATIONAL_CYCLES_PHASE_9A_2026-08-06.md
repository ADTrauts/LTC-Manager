# Dietary Operational Cycles — Phase 9A

**Date:** 2026-08-06  
**Product:** LTC Manager (not Vssyl)  
**Branch:** `product/dietary-operational-cycles-phase-9a-2026-08-06`  
**Base:** `deployment/dietary-v1-pilot-environment-phase-8b-2026-08-05` @ `48fc1be9ac59188e44f2277ac8634ef4c8ef5aa3`

## Purpose

Phase 9A introduces Department-owned **Operational Cycles**: named phases of the operating day (preparation, service, transition, closeout, custom) with facility-local windows, location applicability, meal association, expected Milestones, and draft/publish/retire lifecycle.

Runtime can answer which cycle is active or next, which Units apply, which Assignment windows overlap, and which readiness/service confirmations are expected — without implementing Job Flow, automatic tasks, or the broad Operations Engine.

## Architecture trace (summary)

| Concept | Finding |
|---------|---------|
| `OperationDefinition` / `OperationInstance` | Present; intended as Operations Engine catalog/occurrence. Flag `OPERATION_ENGINE_ENABLED` remains **false**. Definition local times are non-authoritative. |
| `OperationTemplate` / `OperationStep` | Do not exist. |
| Meal targets | **`UnitMealTime`** is authoritative per Unit + `MealType`. |
| Service-time groups | Product language only — emerge from clustering per-unit meal times; no Prisma group model. |
| Assignments | `OperationalAssignment` / Plan / windows — separate staffing responsibility. |
| Milestones | `ServeryMealServiceEvent` + append-only `ServeryMilestoneEntry`. |
| Meal-context resolver | `resolveServeryMealServiceContext` — ACTIVE/UPCOMING/BETWEEN/DAY_COMPLETE/NOT_CONFIGURED/NOT_APPLICABLE. |
| Department Builder | Profile tabs behind `DEPARTMENT_OPERATIONAL_PROFILES_ENABLED`; Phase 9A adds **Operational Cycles** tab. |
| Offline | Phase 6A bundle: meal context + Ready/Started writes only. |

### Operations Engine — why it stays disabled

1. Intended to bind dated OperationInstances for OC/Unit/Today scoping.
2. Remains off until sync/backfill and Build authoring are verified.
3. Safe to reuse later as optional FK targets; unsafe to flip the flag for 9A (empty/wrong instances change scoping; definition times compete with UnitMealTime).
4. Phase 9A does **not** activate `OPERATION_ENGINE_ENABLED`.

## Canonical ownership decision

| Concern | Owner |
|---------|-------|
| **Operational Cycle definitions** | Department Builder → `DepartmentOperationalCycle` (new) |
| **Meal service target times** | `UnitMealTime` (Units Admin) |
| **Employee responsibility windows** | Operational Assignments |
| **Actual confirmations** | Servery Milestones (Ready / Service Started) |
| **Future Logs/Checklists/Inspections evidence** | Templates (not in 9A) |
| **Runtime** | Resolves published config for the operational date; does not rewrite Build |

### Why not reuse `OperationDefinition` as the cycle model?

`OperationDefinition` lacks draft/publish/retire, applicable weekdays, location applicability, expected Milestones, cycle types, and effective dating. Extending it would couple Dietary day phases to the unfinished Operations Engine. Phase 9A introduces the smallest explicit Department-owned cycle model instead.

**One concept, one owner.** Cycles do not duplicate meal clocks. Assignments are not cycles. Milestone absence is not proof that service failed.

## Cycle contract

- Stable key + version, facility, department, label, optional description
- Type: `PREPARATION` | `SERVICE` | `TRANSITION` | `CLOSEOUT` | `CUSTOM`
- Display sequence, start/end local (`HH:mm`), overnight structural support
- Applicable days of week (facility-local), effectiveFrom / optional effectiveTo
- Location mode: all department units | unit types | explicit units
- Optional `MealType` (targets still from UnitMealTime)
- Expected Milestones for SERVICE cycles
- Status: `DRAFT` | `PUBLISHED` | `RETIRED`
- Audit via `DepartmentOperationalCycleEvent`
- Retirement — never delete published historical configuration

Custom labels are user-facing (e.g. “Morning Preparation”); not hardcoded as universal Department language. Dietary defaults are generate-then-review Drafts only.

## Time and resolution

- All calculations use Facility IANA timezone.
- Operational date from certified facility service-date rules.
- Browser timezone does not change operational date (UTC browser ≡ America/New_York for the same `now`).
- Phase 9A **forbids overlapping** published same-day cycles that share applicable days and location scope (write-time validation). Structural overnight support is retained for later.
- Primary among concurrent actives (if ever allowed later): `displaySequence` → `stableKey` → `id` — never DB row order.
- Occurrences are **derived**, not persisted.

Runtime states (shared union pattern with meal context):

`ACTIVE` | `UPCOMING` | `BETWEEN` | `DAY_COMPLETE` | `NOT_CONFIGURED` | `NOT_APPLICABLE`

Missing configuration → `NOT_CONFIGURED`. No invented Breakfast default.

## Publication

- **DRAFT** — editable; not Runtime-visible; previewable by managers.
- **PUBLISHED** — effective prospectively by dates; historical versions remain readable.
- **RETIRED** — not prospective; prior operational dates retain context via effective dating.
- Published window fields are immutable; change via duplicate → new draft version → publish (supersedes prior `stableKey`).

## Surfaces

| Surface | Behavior |
|---------|----------|
| Department Builder → Operational Cycles | Create/edit/duplicate/reorder Drafts, day preview, publish, retire, generate Dietary defaults |
| Employee / Unit Workspace | Read-only cycle card; Assignment remains separate |
| Supervisor `/staffing/cycles` | Exception-first overview across applicable serverys |
| GM dashboard | Compact current/next + readiness strip (does not replace staffing/timing) |
| Offline bundle | Read-only scoped `cycleContext`; no cycle edit; no new command types |

## Authority

| Role | Runtime view | Department overview | Manage / publish |
|------|--------------|---------------------|------------------|
| STAFF / LEAD | Published context | No | No |
| SUPERVISOR | Yes | Yes | No |
| MANAGER / GM | Yes | Yes | Yes (facility + department scope) |
| FACILITY_ADMINISTRATOR | Only with Dietary `primaryDepartmentId` | Same | Same — **role alone denied** |
| Quick PIN | Runtime only | No Build escalation | No |

Route policy: `/admin/departments` and `/admin/departments/[departmentId]` admit Manager+ so Managers can reach the Cycles tab. Mutations still enforce cycle authority.

## Feature activation

```bash
DIETARY_OPERATIONAL_CYCLES_ENABLED=true
OPERATION_ENGINE_ENABLED=false   # must remain off
OPERATIONAL_ASSIGNMENTS_ENABLED=true  # for Assignment overlap context in pilot
```

Default is safe (cycles off). Server actions and Runtime respect the flag.

## Known limitations (Phase 9A)

- No full Employee Job Flow / odometer
- No automatic task generation or scheduling
- No automatic Assignment generation
- No generalized Supervisor Operations Board
- Operations Engine remains disabled
- No offline cycle editing
- Overlapping concurrent cycles not supported (enforced at publish)
- No unified Logs/Checklists/Inspections builder
- No EVS / Plant Operations cycles productization

## Phase 9B boundary (indicative)

Job Flow guidance, evidence requirements tied to cycles, richer Supervisor board, and optional concurrent-cycle support — without conflating meal clocks or activating unfinished Operations Engine behaviors prematurely.

Activation for Phase 9B (in addition to cycles):

```bash
DIETARY_JOB_FLOW_ENABLED=true
# OPERATION_ENGINE_ENABLED must remain false
```

See `docs/operations/DIETARY_EMPLOYEE_JOB_FLOW_PHASE_9B_2026-08-06.md`.

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
