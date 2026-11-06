# Modernization Audit

**Status:** Engineering implementation reconnaissance  
**Date:** 2026-07-07  
**Application root:** `ltc-manager/`  
**Authority:** [01_MODERNIZATION_ROADMAP.md](./01_MODERNIZATION_ROADMAP.md) (unchanged)

This document bridges the certified twelve-wave roadmap to **concrete code execution**. It is an engineering audit, not planning or UX documentation. No application code was modified to produce it.

**Baseline:** ~146 TypeScript/TSX files under `src/`, 32 Prisma migrations, ~30 models, ~45 production-ready feature areas ([04-existing-features.md](../architecture-review/04-existing-features.md)).

---

# Per-Wave Implementation Gaps

---

## Wave 1 — Application Shell & Navigation

### Current implementation

- **Shell:** `app-shell.tsx` (131 lines) — header with facility name, department switcher, horizontal `TopNav`, `LeftSidebar`, main content. No zone concept.
- **Top nav:** Flat list of `AppRoute` modules from DB (`Dashboard`, `Units`, `Logs`, `Staffing`, etc.) via `route-permissions.ts`. Client component `top-nav.tsx` (52 lines) with active-path matching.
- **Sidebar:** `left-sidebar.tsx` already labels section **Locations** but links to **Dashboard** (not Operations Center) plus unit list. No readiness chips.
- **Department scope:** Hardcoded `OperationalDepartmentKey = "DIETARY" | "EVS" | "PLANT"` in `department-nav.ts` (84 lines). `NAV_DEPARTMENT_RULES` array filters module links by cookie.
- **RBAC:** `proxy.ts` (101 lines) — JWT, onboarding gate, `canAccessRouteByRole`, department pathname allowlist. Denied users redirect to `/dashboard`.
- **Default home:** All roles land on `/dashboard` after login/onboarding; no role-based home routing.
- **Seed:** `prisma/seed.mjs` — 12 routes, labels include "Dashboard", "Units", "EVS board", "Repairs".

### Target implementation

- Five permanent **zones**: Operations Center, Locations, Today's Work, Review, Administration ([01_NAVIGATION_SYSTEM.md](../product-reference/01_NAVIGATION_SYSTEM.md)).
- Manager default home → Operations Center; employee/PIN → Locations or locked unit workspace.
- Department switcher = **operational mode lens**, not parallel app.
- Top nav organized by zone + role capability; module links nested under zones or secondary nav.
- Locations rail with readiness placeholder (chip slot for Wave 6).
- UI copy: "Operations Center" not Dashboard; "Locations" not Units in nav labels.
- Kiosk/tablet/desktop behavior per Product Reference certification.

### Gap summary

| Gap | Severity |
|-----|----------|
| No zone model in code | Critical |
| Module-first top nav | Critical |
| No role-based default home | High |
| Sidebar says Locations but links Dashboard | Medium |
| No Today's Work route (Wave 4 prep: stub OK) | Medium |
| Hardcoded department keys block industry packs | High (full fix Wave 12) |
| `AppRoute` labels not certified terminology | Low |

### Complexity

**Medium**

### Estimated engineering effort

**56 hours** (1.4 weeks)

### Dependencies

None

### Risk

**Medium** — navigation and `proxy.ts` touch every session; incorrect RBAC or department allowlist breaks all roles.

### Primary files affected

| File | Lines | Role |
|------|-------|------|
| `src/components/app-shell.tsx` | 131 | Shell layout, zone regions |
| `src/components/top-nav.tsx` | 52 | Zone-aware nav |
| `src/components/left-sidebar.tsx` | 64 | Locations rail |
| `src/lib/route-permissions.ts` | 190 | Nav items, default home |
| `src/lib/department-nav.ts` | 84 | Mode filter rules |
| `src/proxy.ts` | 101 | Path allowlists |
| `prisma/seed.mjs` | ~400+ | AppRoute labels/order |

### Secondary files affected

`src/components/department-scope-switcher.tsx`, `src/hooks/use-nav-pathname.ts`, `src/lib/active-department-context.ts`, `src/app/(protected)/layout.tsx`, `src/lib/access.ts`, `src/app/api/auth/session/route.ts`, `src/lib/route-permissions.test.ts`

### Database impact

**Low** — `AppRoute` label/navOrder updates via seed upsert; optional inactive `/today` route row. No migration required.

### Testing impact

**High** — extend `route-permissions.test.ts`; manual matrix: 6 roles × 3 department modes × kiosk lock; run existing `credential-policy.test.ts`.

### Regression risk

**High** for permission redirects; **medium** for nav visibility; **low** for visual-only label changes.

### Recommended implementation order

1. `nav-zones.ts` lib (zone enum + pathname mapping)  
2. `route-permissions.ts` zone grouping + default home helper  
3. `top-nav.tsx` zone UI  
4. `app-shell.tsx` layout + role home  
5. `left-sidebar.tsx` copy + structure  
6. `department-nav.ts` / switcher copy (mode lens)  
7. `proxy.ts` allowlist for `/today` stub  
8. Seed + manual regression  

### Potential hidden technical debt

- `TopNav` special-cases `/employees` subpaths inline — will multiply with zone nesting.
- `route-permissions.ts` 30s in-memory cache — must `clearRoutePermissionCache()` after seed/admin permission changes (already exported).
- Fallback nav in `route-permissions.ts` duplicates seed definitions — drift risk if DB empty.
- Proxy redirects all denials to `/dashboard` — may need zone-aware fallback later.

### Potential opportunities to simplify

- Extract shared `isActivePath()` from `top-nav.tsx` and `left-sidebar.tsx` into `src/lib/nav-utils.ts`.
- Single source for route metadata: zone + department visibility + min role (replace parallel arrays in seed, fallback, department-nav).

### Potential reusable components

- `drawer.tsx` — future zone panels  
- `module-placeholder.tsx` — Today's Work stub page pattern  
- Existing `sidebarLinkClass` / `linkClass` patterns — extract `nav-link-styles.ts`

### Potential reusable services

- `getNavItemsForRole()` — extend, do not replace  
- `filterNavItemsForDepartmentScope()` — keep as mode filter  
- `resolveActiveDepartmentForShell()` — already centralizes dept context  

### Potential reusable database models

- `AppRoute` — add optional `zoneKey` column (future) or map in code first  
- `RoleRoutePermission` — unchanged  

### Recommended feature flags

None required for Wave 1. Optional: `NAV_ZONES_ENABLED=true` for gradual rollout.

### Rollback complexity

**Low** — UI-only + seed revert; no migration. Revert 3–5 component/lib commits.

### Notes

Sidebar header already says "Locations" (partial alignment). Footer still says "Nutrition operations workspace" — neutral copy deferred to Wave 12 or quick win.

---

## Wave 2 — Operations Center

### Current implementation

- **Route:** `/dashboard` — `dashboard/page.tsx` (482 lines), monolithic Server Component.
- **Layout:** Tab switcher `units | employees` via query param; not exception-first.
- **Data:** Single `Promise.all` fetching units, log assignments/submissions, schedule/overrides, open repairs, birthdays, servery events, manager count — all inline, no shared lib.
- **Cards:** Compliance summary, servery grid, staffing, repairs, birthdays, onboarding checklist — **fixed order**, not prioritized by exception severity.
- **Meal context:** Uses `isServerySlotLiveForBoard`, `getDefaultMealTypeForTimeOfDay` inline; no site-wide operation header banner.
- **Label:** UI says "Dashboard" everywhere (sidebar, seed, page title).

### Target implementation

- **SCR-01 Operations Center** — exceptions-first card order per [02_OPERATIONS_CENTER_REFERENCE.md](../product-reference/02_OPERATIONS_CENTER_REFERENCE.md) and [FIRST_PRODUCT_SLICE.md](../platform-vision/FIRST_PRODUCT_SLICE.md):
  1. Current meal period banner  
  2. Call-downs open (Wave 4 data; placeholder OK)  
  3. Units not ready (Wave 6; placeholder OK)  
  4. Logs failed/overdue  
  5. Open equipment/supply issues  
  6. Staffing gaps  
  7. Servery meal status grid  
  8. Birthdays/secondary  
- Site pulse aggregate ("14 ready · 2 blocked").
- Rename to Operations Center in UI; optional `/operations` alias → redirect.
- Extract card data loaders to `src/lib/operations-center/`.

### Gap summary

| Gap | Severity |
|-----|----------|
| 482-line page with embedded query logic | High |
| No exception-first ordering | Critical |
| No operation/meal period header | High |
| No site pulse | Medium |
| Employees tab on manager home (non-certified) | Medium |
| Duplicate `fmtMealLabel` vs unit page | Low |

### Complexity

**Medium**

### Estimated engineering effort

**48 hours**

### Dependencies

Wave 1 (zone labeling, Operations Center as manager home)

### Risk

**Low–Medium** — mostly read-path repackaging; performance risk from duplicated queries if not consolidated.

### Primary files affected

| File | Lines |
|------|-------|
| `src/app/(protected)/dashboard/page.tsx` | 482 |
| **New** `src/lib/operations-center/*.ts` | — |
| `src/components/left-sidebar.tsx` | 64 (Dashboard → Operations Center link) |

### Secondary files affected

`src/lib/servery-meal-service.ts`, `src/components/servery-meal-service-controls.tsx`, `prisma/seed.mjs` (Dashboard label), `src/app/(protected)/reports/page.tsx` (cross-links)

### Database impact

**None** — read-only queries on existing models.

### Testing impact

**Medium** — snapshot or unit tests for card ordering logic; manual 60-second manager test from FIRST_PRODUCT_SLICE.

### Regression risk

**Medium** — managers rely on current tab layout; onboarding checklist visibility; servery grid accuracy.

### Recommended implementation order

1. Extract query functions to `operations-center/`  
2. Build card registry with priority order  
3. Operation/meal header component  
4. Recompose page layout  
5. Deprioritize/hide employees tab or move to Administration  
6. Label rename + optional redirect  

### Potential hidden technical debt

- Dashboard and unit page duplicate today-window queries, submission filtering, meal formatting.
- `noStore()` on every request — necessary but prevents static optimization.
- Open repairs query lacks issue type dimension (Wave 8).

### Potential opportunities to simplify

- Split 482-line page into ~5 card components + 1 orchestrator.
- Shared `getTodayWindow()` util (also in unit page).
- Card registry pattern enables Wave 6 readiness injection without reorder rewrite.

### Potential reusable components

- `servery-meal-service-controls.tsx` — meal period display  
- New: `operations-center-card.tsx` wrapper  

### Potential reusable services

- `servery-meal-service.ts` — extend with `getActiveMealPeriodForSite()`  
- New: `operations-center/load-cards.ts`  

### Potential reusable database models

Read-only: `ServeryMealServiceEvent`, `LogAssignment`, `LogSubmission`, `Repair`, `ScheduleEntry`, `AssignmentOverride`, `Unit`

### Recommended feature flags

`OPS_CENTER_V2=true` — swap card layout while keeping old order fallback.

### Rollback complexity

**Low** — page revert; lib folder delete.

### Notes

Wave 6 v0 readiness chips can ship here if scoped: add `loadBlockedUnits()` to operations-center lib without schema.

---

## Wave 3 — Unit Workspace

### Current implementation

- **Route:** `/unit/[unitId]/page.tsx` (583 lines) — monolithic Server Component.
- **Tabs:** `overview | logs` via `unitTab` query param.
- **Sections:** Unit header, servery controls, today's menu, schedule/coverage, open repairs, log assignments/submissions, meal service history — **no single work queue**.
- **Log entry:** Embedded in page + links to full logs UX; uses inline queries not shared with `/logs`.
- **Quick issue:** No dietary quick-create form (EVS has `createEvsRepairTicketAction` in `evs/actions.ts`).
- **PIN/kiosk:** Works via session + device lock; layout not optimized for minimal chrome.

### Target implementation

- **SCR-02 Unit Workspace** — one primary question: "What do I do here, now?"
- Operation context header (meal period + phase).
- Prioritized work queue: logs due → servery actions → open issues.
- Quick actions: meal ready/started, log submit, report issue (form Wave 8).
- Readiness chip on workspace (Wave 6).
- PIN-optimized density; no admin modules on page.

### Gap summary

| Gap | Severity |
|-----|----------|
| 583-line monolith | High |
| No unified work queue | Critical |
| No operation context header | High |
| No quick issue form | Medium (Wave 8) |
| Log UX split between unit tab and `/logs` | Medium |

### Complexity

**Medium**

### Estimated engineering effort

**44 hours**

### Dependencies

Wave 1 (Locations rail), Wave 2 (shared meal/readiness vocabulary)

### Risk

**Low** — extends production-ready page; kiosk layout regression primary concern.

### Primary files affected

| File | Lines |
|------|-------|
| `src/app/(protected)/unit/[unitId]/page.tsx` | 583 |
| `src/app/(protected)/unit/[unitId]/actions.ts` | ~small |
| `src/components/servery-meal-service-controls.tsx` | — |
| `src/components/logs/logs-tabs-client.tsx` | — |

### Secondary files affected

`src/lib/menu-db.ts`, `src/lib/servery-meal-service.ts`, `src/lib/units.ts`, `src/components/left-sidebar.tsx`

### Database impact

**None** for layout wave; read-only.

### Testing impact

**Medium** — PIN flow manual test; verify log submit + servery in ≤3 taps.

### Regression risk

**Low–Medium** — log submit path, menu display, servery window logic.

### Recommended implementation order

1. Extract data loaders (share with dashboard where possible)  
2. Define work queue sort rules  
3. Recompose layout sections → queue-first  
4. Operation header component (share servery lib)  
5. Kiosk responsive pass  
6. Readiness chip slot (stub OK)  

### Potential hidden technical debt

- `pickDefaultMealTypeForUnitSlots` duplicated call patterns across pages.
- Menu load try/catch patterns in `menu-db.ts` — unit page depends on graceful degradation.
- Unit page `take: 15` on log history — arbitrary limit.

### Potential opportunities to simplify

- Extract `UnitWorkspaceLoader` server lib used by page only.
- Reuse operations-center card queries filtered to single `unitId`.

### Potential reusable components

- `servery-meal-service-controls.tsx`  
- `logs-tabs-client.tsx` — embed slimmer variant  
- `drawer.tsx` — quick actions  

### Potential reusable services

- `servery-meal-service.ts`, `menu-db.ts`, `menu-cycle.ts`  
- Future: `readiness/compute-readiness.ts` (Wave 6)  

### Potential reusable database models

`Unit`, `LogAssignment`, `LogSubmission`, `ScheduleEntry`, `Repair`, `ServeryMealServiceEvent`, `MenuItem`

### Recommended feature flags

`UNIT_WORKSPACE_V2=true`

### Rollback complexity

**Low** — single page revert.

### Notes

Left sidebar already navigates to units correctly. Wave 8 adds quick issue without full layout rewrite if queue slot reserved.

---

## Wave 4 — Supervisor & Today's Work

### Current implementation

- **No `/today` route** — supervisor workflows scattered across `/staffing`, `/dashboard`, `/unit/[unitId]`, `/logs`.
- **Supervisor role:** `RoleKey.SUPERVISOR` in schema; minimum routes in seed — no dedicated workspace.
- **Call-downs:** `AssignmentOverride` with free-text reason — no call-down template, no open list, no dashboard card.
- **Walk list:** Manual — supervisor visits sidebar units one by one.
- **Handoffs:** No cross-department pending work surface.

### Target implementation

- New zone route `/today` with sub-routes: walk, coverage, handoffs (SCR-03–05).
- Supervisor+ nav includes Today's Work.
- Walk list: all active units ordered by readiness/exceptions.
- Coverage: call-down list + link to staffing with pre-filled date/unit.
- Call-down v0: promote override creation with reason template; open override list on Operations Center.

### Gap summary

| Gap | Severity |
|-----|----------|
| Entire Today's Work surface missing | Critical |
| No walk list ordering | Critical |
| No call-down semantics | High |
| No handoffs view | Medium |

### Complexity

**Large**

### Estimated engineering effort

**72 hours**

### Dependencies

Waves 1–3; readiness signals (Wave 6 v0 strongly recommended)

### Risk

**Medium** — new routes + permissions; supervisor/staff boundary.

### Primary files affected

| File | Status |
|------|--------|
| **New** `src/app/(protected)/today/page.tsx` | Create |
| **New** `src/app/(protected)/today/walk/page.tsx` | Create |
| **New** `src/app/(protected)/today/coverage/page.tsx` | Create |
| **New** `src/app/(protected)/today/handoffs/page.tsx` | Create |
| **New** `src/lib/todays-work/*.ts` | Create |
| `src/app/(protected)/staffing/page.tsx` | Deep-link params |
| `src/app/(protected)/staffing/actions.ts` | Call-down override helper |
| `prisma/seed.mjs` | `/today` route + permissions |

### Secondary files affected

`src/proxy.ts`, `src/lib/route-permissions.ts`, `src/lib/department-nav.ts`, `src/app/(protected)/dashboard/page.tsx` (call-down card)

### Database impact

**Low** — no schema required for v0; optional `AssignmentOverride.reasonCode` enum later.

### Testing impact

**High** — new route permission tests; supervisor vs staff access; walk order unit tests.

### Regression risk

**Medium** — staffing override creation path; must not break schedule grid.

### Recommended implementation order

1. Seed route + permissions  
2. `todays-work/walk-list.ts` loader  
3. Walk page  
4. Coverage page + staffing deep links  
5. Call-down create action + list  
6. Handoffs v0 (open repairs + failed logs rollup)  
7. Operations Center call-down card (Wave 2 follow-up)  

### Potential hidden technical debt

- `AssignmentOverride` lacks structured reason codes — reporting/filtering fragile.
- Staffing page complexity unknown without full read — deep-link contract must be documented.

### Potential opportunities to simplify

- Handoffs v0 = filtered join of existing dashboard queries — no new models.
- Walk list reuses readiness compute from Wave 6.

### Potential reusable components

- `staffing-toolbar.tsx` — date/unit params  
- `staffing-auto-assign-form.tsx` — coverage helper  
- Card components from operations-center  

### Potential reusable services

- `scheduling-eligibility.ts`  
- `staffing/actions.ts`  
- Readiness lib (Wave 6)  

### Potential reusable database models

`Unit`, `ScheduleEntry`, `AssignmentOverride`, `Employee`, `Repair`, `LogSubmission`

### Recommended feature flags

`TODAYS_WORK_ENABLED=true`

### Rollback complexity

**Low** — remove routes + seed entries; no migration.

### Notes

Can ship walk list before handoffs if needed. Product Reference 04 supervisor flows require Wave 4 minimum for certification progress.

---

## Wave 5 — Operations Engine

### Current implementation

- **No Operation entity** — time scope implicit via `MealType`, `serviceDate` on logs, `ScheduleEntry.date`, `ServeryMealServiceEvent` timestamps.
- **Meal period logic:** `servery-meal-service.ts` (53 lines) — time-of-day heuristics only.
- **Department cookie:** Coarse operational mode, not linked to operation instances.
- **Menu cycle:** `menu-cycle.ts` — week/day grid, not operation-scoped.

### Target implementation

- Prisma: `OperationDefinition` + `OperationInstance` (department + meal type + date + status).
- Active operation resolver in `src/lib/operations/`.
- Operations Center header, unit workspace header, log/staffing filters use operation instance.
- Backfill/sync job from `UnitMealTime` schedules.
- Feature-flagged rollout.

### Gap summary

| Gap | Severity |
|-----|----------|
| No operation entity | Critical |
| Implicit time scoping scattered | High |
| No backfill strategy | High |
| Logs linked by mealType not operationId | Medium |

### Complexity

**Large**

### Estimated engineering effort

**96 hours**

### Dependencies

Waves 2–4 (consumers of operation context)

### Risk

**High** — schema migration + backfill; timezone/meal boundary edge cases.

### Primary files affected

| File | Impact |
|------|--------|
| `prisma/schema.prisma` | New models + FKs |
| `prisma/migrations/*` | New migration |
| **New** `src/lib/operations/*.ts` | Core resolver |
| `src/app/(protected)/dashboard/page.tsx` | Header wiring |
| `src/app/(protected)/unit/[unitId]/page.tsx` | Context wiring |
| `src/app/(protected)/logs/actions.ts` | Filter scope |
| `src/app/(protected)/staffing/actions.ts` | Filter scope |
| `src/lib/servery-meal-service.ts` | Link events |

### Secondary files affected

`src/app/(protected)/logs/page.tsx`, `src/app/(protected)/staffing/page.tsx`, `src/app/(protected)/reports/page.tsx`, `scripts/backfill-*.mjs`

### Database impact

**High** — new tables, nullable FKs on existing tables optional phase 2, backfill script required.

### Testing impact

**Very high** — migration test on clone; unit tests for timezone boundaries; integration across logs/staffing/servery.

### Regression risk

**High** — wrong active operation → wrong logs due / staffing scope.

### Recommended implementation order

1. Schema design + migration  
2. `resolveActiveOperation()` + CRUD for instances  
3. Daily sync job (create today's instances from definitions)  
4. Wire Operations Center header  
5. Wire log assignment filtering  
6. Wire staffing filtering  
7. Backfill historical optional  
8. Feature flag on  

### Potential hidden technical debt

- `MealType` enum baked into logs, servery, menus — operation layer must map cleanly.
- Facility timezone not stored — all `Date` math uses server/local implicit TZ.
- `WorkShift` model underused — may overlap operation definitions.

### Potential opportunities to simplify

- Phase 1: operation instances for dietary meal periods only (ADL-005).
- Nullable `operationInstanceId` on new submissions only — no retroactive migration.

### Potential reusable components

- Meal period banner component from Wave 2 — consume operation lib  

### Potential reusable services

- `servery-meal-service.ts` — delegate default meal to operation resolver  
- `menu-cycle.ts` — operation date alignment  

### Potential reusable database models

`UnitMealTime`, `Department`, `MealType`, `ServeryMealServiceEvent`, `WorkShift`

### Recommended feature flags

`OPERATION_ENGINE_ENABLED=false` (default until backfill verified)

### Rollback complexity

**High** — forward-fix migration; disable flag to fall back to mealType heuristics.

### Notes

Do not block Bundle A (Waves 1–4) on Wave 5. Operation header in Waves 2–3 can use `servery-meal-service.ts` until Wave 5 lands.

---

## Wave 6 — Readiness Engine

### Current implementation

- **No readiness aggregate** — signals exist separately: log submission status, servery events, open repairs, schedule entries.
- **Dashboard:** Shows compliance counts but not per-unit Complete/In progress/Blocked.
- **Sidebar:** Unit names only — no chips.
- **Missed logs:** `LogSubmissionStatus.MISSED` enum exists; auto-detection unclear ([04-existing-features.md](../architecture-review/04-existing-features.md) Partial).
- **EVS:** `RoomAreaStatus` per unit/day — not folded into site readiness.

### Target implementation

- **v0:** `src/lib/readiness/compute-readiness.ts` — composite from existing tables, no migration.
- **v1:** Optional `ReadinessSnapshot` model; missed-log background job.
- Chips on Locations rail, Operations Center pulse, unit workspace, walk list.
- Blocked rules per FIRST_PRODUCT_SLICE: failed required log, HIGH/URGENT open repair, zero staffing at servery/kitchen.

### Gap summary

| Gap | Severity |
|-----|----------|
| No readiness computation | Critical |
| No per-location chip UI | High |
| No site pulse | High |
| No missed-log job | Medium |
| EVS readiness not integrated | Medium |

### Complexity

**Medium (v0)** / **Large (v1)**

### Estimated engineering effort

**24 hours (v0)** + **52 hours (v1)** = **76 hours total**

### Dependencies

v0: Wave 2 sufficient. v1: Wave 5 preferred.

### Risk

**Medium** — false blocked/complete undermines trust.

### Primary files affected

| File | v0 | v1 |
|------|----|----|
| **New** `src/lib/readiness/*.ts` | ✓ | ✓ |
| **New** `src/components/readiness-chip.tsx` | ✓ | ✓ |
| `src/components/left-sidebar.tsx` | ✓ | ✓ |
| `src/app/(protected)/dashboard/page.tsx` | ✓ | ✓ |
| `src/app/(protected)/unit/[unitId]/page.tsx` | ✓ | ✓ |
| `prisma/schema.prisma` | — | ✓ |
| **New** `scripts/missed-log-detection.mjs` | — | ✓ |

### Secondary files affected

`src/lib/todays-work/walk-list.ts`, `src/app/(protected)/evs/page.tsx`, `src/app/(protected)/reports/page.tsx`

### Database impact

**None (v0)** / **Medium (v1)** — optional snapshot table + job writes MISSED status.

### Testing impact

**Very high** — unit tests for every blocked rule branch; fixture-based integration tests.

### Regression risk

**Medium** — performance if readiness computed per sidebar unit per request (N+1).

### Recommended implementation order

1. Define types + blocked rules (test-first)  
2. Batch query loader for all units  
3. `readiness-chip.tsx`  
4. Wire sidebar + dashboard  
5. Wire unit page + walk list  
6. (v1) Snapshot model + job  

### Potential hidden technical debt

- "Required log for current meal" requires assignment recurrence logic duplicated from dashboard.
- Staffing zero-detection needs unit type filter (SERVERY/KITCHEN) — `UnitType` enum coupling.
- Computing readiness in AppShell for sidebar may add latency to every page load.

### Potential opportunities to simplify

- Compute readiness once in `app-shell.tsx`, pass to sidebar as props (single batch query).
- v0 ship in Wave 2 bundle — avoids duplicate dashboard refactor.

### Potential reusable components

- `readiness-chip.tsx` — all surfaces  

### Potential reusable services

- **New** `computeSiteReadiness(units, signals)` — single entry  
- `servery-meal-service.ts` — input signal  

### Potential reusable database models

Read: `LogSubmission`, `LogAssignment`, `Repair`, `ScheduleEntry`, `ServeryMealServiceEvent`, `RoomAreaStatus`, `Unit`

### Recommended feature flags

`READINESS_V1_ENABLED=false`, `MISSED_LOG_JOB_ENABLED=false`

### Rollback complexity

**Low (v0)** / **Medium (v1)** — remove chip; job disable.

### Notes

**Strong recommendation:** implement v0 during Wave 2 to avoid second dashboard pass. Batch query in shell to prevent sidebar query explosion.

---

## Wave 7 — Work Engine

### Current implementation

- **No Task model** — episodic work split across `LogSubmission`, `Repair`, `AssignmentOverride`.
- **Logs:** Full pipeline production-ready — `logs/actions.ts` (347 lines).
- **Repairs:** Production-ready — `repairs/actions.ts` (447 lines).
- **Inspections:** `UnitDepartmentResponsibility.inspectionFrequency` string field only — editable in `units-manager.tsx`, no workflow.
- **PM:** `PreventiveMaintenanceSchedule` linked to assets — partial UI on repairs page.

### Target implementation

- `Task` model + `TaskType` enum (LOG, REPAIR, INSPECTION, COVERAGE, AD_HOC).
- Adapter sync on log submit and repair create — dual-write, logs/repairs remain source of truth (ADL-007).
- Inspection checklist create + submit flow.
- Internal task inbox queries — no mandatory new UI yet.

### Gap summary

| Gap | Severity |
|-----|----------|
| No unified Task entity | Critical |
| Inspection workflow missing | High |
| Dual-write sync complexity | High |
| 347 + 447 line action files | Medium |

### Complexity

**Very Large**

### Estimated engineering effort

**160 hours**

### Dependencies

Waves 5–6; ADL-007

### Risk

**High** — compliance log pipeline must not break.

### Primary files affected

| File | Lines |
|------|-------|
| `prisma/schema.prisma` | 1027 |
| `src/app/(protected)/logs/actions.ts` | 347 |
| `src/app/(protected)/repairs/actions.ts` | 447 |
| **New** `src/lib/work/*.ts` | — |
| `src/components/units-manager.tsx` | inspection cadence |
| `src/app/(protected)/units/actions.ts` | inspectionFrequency |

### Secondary files affected

`src/app/(protected)/staffing/actions.ts`, `src/app/(protected)/evs/actions.ts`, `src/app/(protected)/today/**`

### Database impact

**Very high** — Task + Inspection models, FKs, indexes, backfill optional.

### Testing impact

**Very high** — adapter unit tests; log/repair integration tests unchanged behavior; transaction rollback tests.

### Regression risk

**Very high** — any submit failure blocks floor work.

### Recommended implementation order

1. Task schema + types  
2. `log-task.ts` adapter (sync on create only)  
3. `repair-task.ts` adapter  
4. Feature flag + verify dual-write  
5. Inspection schema + minimal submit  
6. Inspection UI on unit or units admin  
7. Inbox query (internal)  

### Potential hidden technical debt

- Log submissions immutable for compliance — Task update semantics must be append-only or snapshot.
- Repair status transitions complex — adapter must mirror all paths in 447-line actions file.
- Global `assetCode` unique constraint unrelated but touches repair/asset task linking.

### Potential opportunities to simplify

- Ship 7a (sync only) with zero UI — reduces risk.
- Inspection v1 = log template subtype before separate Inspection model.

### Potential reusable components

- `logs-tabs-client.tsx` — submission UX unchanged  
- Task inbox can reuse card patterns from operations-center  

### Potential reusable services

- `attachments.ts` — work attachments  
- `repair-routing.ts` — task routing metadata  

### Potential reusable database models

`LogTemplate`, `LogSubmission`, `Repair`, `RepairUpdate`, `AssignmentOverride`, `PreventiveMaintenanceSchedule`

### Recommended feature flags

`TASK_SYNC_ENABLED=false` (mandatory until verified)

### Rollback complexity

**High** — disable sync flag; Task tables can remain orphaned.

### Notes

Split into 7a/7b sub-releases per [04_RELEASE_STRATEGY.md](./04_RELEASE_STRATEGY.md). Do not unify UI until sync proven.

---

## Wave 8 — Issue & Recovery

### Current implementation

- **Repair model** — corrective/preventive work orders; UI label "Repairs"; production-ready.
- **Routing:** `repair-routing.ts` — department + trade hints.
- **EVS quick ticket:** `evs/actions.ts` → `createEvsRepairTicketAction` — pattern exists.
- **Unit page:** Shows open repairs list — no quick create for dietary.
- **No issue types** — equipment only in practice; no SUPPLY_SHORT.
- **No SCR-06 detail page** — list view only on `/repairs`.

### Target implementation

- `IssueType` on Repair or parallel Issue table (ADL-008 incremental).
- Supply short form on unit workspace (&lt;30s).
- Issue board on Operations Center.
- `/issues/[id]` or enhanced `/repairs/[id]` detail (SCR-06).
- Readiness blocked rules include issue severity/types.
- Recovery lifecycle visible in UI.

### Gap summary

| Gap | Severity |
|-----|----------|
| Repair ≠ generic Issue | High |
| No supply short path | High |
| No issue detail screen | Medium |
| Attachments partial | Medium |

### Complexity

**Large**

### Estimated engineering effort

**80 hours**

### Dependencies

Waves 3, 6, 7 (task linkage optional)

### Risk

**Medium** — schema on production repairs; routing regression.

### Primary files affected

| File | Impact |
|------|--------|
| `prisma/schema.prisma` | issueType enum/column |
| `src/app/(protected)/repairs/page.tsx` | filters, copy |
| `src/app/(protected)/repairs/actions.ts` | supply short |
| `src/lib/repair-routing.ts` | type-aware routing |
| `src/app/(protected)/evs/actions.ts` | issue type |
| `src/app/(protected)/unit/[unitId]/page.tsx` | quick form |
| **New** `src/app/(protected)/issues/[issueId]/page.tsx` | detail |

### Secondary files affected

`src/lib/attachments.ts`, `src/lib/readiness/blocked-rules.ts`, `src/app/(protected)/dashboard/page.tsx`, `src/app/(protected)/reports/page.tsx`

### Database impact

**Medium** — additive enum/column + migration default EQUIPMENT.

### Testing impact

**High** — repair routing tests; EVS ticket regression; readiness blocked integration.

### Regression risk

**Medium** — reports filter by repair status; EVS nav isolation.

### Recommended implementation order

1. Schema: issueType with default  
2. Quick issue form on unit (8a)  
3. Supply short type + routing  
4. Operations Center issue card  
5. Detail page (8b)  
6. Attachments UI polish  

### Potential hidden technical debt

- Repair title field labeled "Issue title" in some UI — inconsistent domain language.
- `assetCode` globally unique — multi-site Wave 11 conflict.
- Attachment storage local disk — limits issue photos.

### Potential opportunities to simplify

- Extend Repair before new Issue table (ADL-008).
- Reuse EVS action pattern for dietary unit quick create.

### Potential reusable components

- `drawer.tsx` — quick issue form  
- EVS ticket form patterns from `evs/page.tsx`  

### Potential reusable services

- `repair-routing.ts`  
- `attachments.ts`  

### Potential reusable database models

`Repair`, `RepairUpdate`, `Attachment`, `Vendor`, `Asset`, `Department`

### Recommended feature flags

`SUPPLY_SHORT_ENABLED=true`, `ISSUE_DETAIL_V2=true`

### Rollback complexity

**Medium** — nullable column safe; hide quick forms.

### Notes

8a (forms) shippable without 8b (detail page) for FIRST_PRODUCT_SLICE supply minimum.

---

## Wave 9 — Knowledge Layer

### Current implementation

- **Union handbook:** `Facility.unionHandbookPdfPath` + `union-handbook-settings.tsx` + `GET /api/facility/union-handbook` — production-ready.
- **Log templates:** Name + fields — no rich instructions attachment on template.
- **No SOP library**, search, or point-of-work drawer.
- **Storage:** `src/lib/facility-uploads.ts` — local `uploads/` directory.

### Target implementation

- `KnowledgeArticle` model + attachments.
- Link articles to `LogTemplate`, `Unit`, `Asset`.
- Contextual drawer on unit workspace and log submit.
- Handbook as indexed knowledge artifact.
- Department-scoped search.

### Gap summary

| Gap | Severity |
|-----|----------|
| No knowledge model | Critical |
| No template instructions UX | High |
| Local-only file storage | Medium |
| No search | Medium |

### Complexity

**Large**

### Estimated engineering effort

**88 hours**

### Dependencies

Waves 3, 7 (work moment attachments)

### Risk

**Low–Medium** — additive; storage scaling.

### Primary files affected

| File | Impact |
|------|--------|
| `prisma/schema.prisma` | Knowledge models |
| **New** `src/lib/knowledge/*.ts` | CRUD + search |
| **New** `src/app/(protected)/knowledge/page.tsx` | Manager library |
| `src/app/(protected)/unit/[unitId]/page.tsx` | Help drawer |
| `src/app/(protected)/logs/page.tsx` | Template instructions |
| `src/app/(protected)/admin/organization/union-handbook-settings.tsx` | Index integration |
| `src/lib/facility-uploads.ts` | Storage abstraction prep |

### Secondary files affected

`src/app/api/facility/union-handbook/route.ts`, `src/app/(protected)/assets/page.tsx`, `src/components/drawer.tsx`

### Database impact

**Medium** — new tables + join tables.

### Testing impact

**Medium** — upload security; department scope; handbook regression.

### Regression risk

**Low** — handbook path unchanged if additive.

### Recommended implementation order

1. Schema  
2. Knowledge CRUD actions  
3. Template instruction field/link  
4. Unit workspace drawer  
5. Manager search page  
6. Handbook migration to index  

### Potential hidden technical debt

- PDF streaming API separate from knowledge system — duplicate file handling.
- No virus scan on uploads.
- Object storage needed before multi-instance deploy.

### Potential opportunities to simplify

- Phase 1: markdown/text SOPs only — no new file types.
- Handbook remains separate API; link from knowledge index.

### Potential reusable components

- `drawer.tsx`  
- `union-handbook-settings.tsx` upload patterns  

### Potential reusable services

- `facility-uploads.ts` — extend for knowledge paths  
- `attachments.ts` — pattern for files  

### Potential reusable database models

`Facility` (handbook fields), `LogTemplate`, `Unit`, `Asset`, `Attachment`

### Recommended feature flags

`KNOWLEDGE_LAYER_ENABLED=true`

### Rollback complexity

**Low** — hide routes; tables orphaned OK.

### Notes

Storage abstraction here reduces Wave 11 multi-instance pain.

---

## Wave 10 — Operational AI

### Current implementation

- **No AI integration** — no provider SDK, routes, or components.
- **Telemetry:** `telemetry.ts` — lightweight event hook, not analytics platform.
- **Dashboard:** Raw structured data available post-Waves 2+6+8 — no summarization.

### Target implementation

- Env-configured AI provider client in `src/lib/ai/`.
- Morning Brief card on Operations Center (≤3 sentences, dismissible).
- Exception summarization behind flag.
- Prompt templates grounded in readiness/staffing/issue data — no PII policy.
- Optional `AiAuditLog` + API route for async generation.

### Gap summary

| Gap | Severity |
|-----|----------|
| No AI infrastructure | Critical |
| No prompt grounding layer | High |
| No audit trail | Medium |
| No graceful degradation | High |

### Complexity

**Large**

### Estimated engineering effort

**100 hours**

### Dependencies

Waves 2, 6, 8 (operational state richness)

### Risk

**High** — latency, cost, hallucination, privacy.

### Primary files affected

| File | Impact |
|------|--------|
| **New** `src/lib/ai/*.ts` | Provider, prompts |
| **New** `src/app/api/ai/brief/route.ts` | Optional async |
| `src/app/(protected)/dashboard/page.tsx` | Brief card |
| `src/lib/telemetry.ts` | AI events |

### Secondary files affected

`src/lib/operations-center/*.ts`, `src/lib/readiness/*.ts`, environment docs

### Database impact

**Low** — optional audit log table.

### Testing impact

**Medium** — mock provider tests; timeout/fallback tests; manual review of prompts.

### Regression risk

**Low** if off by default — **high** if blocking dashboard load.

### Recommended implementation order

1. Provider abstraction + env gates  
2. Prompt builder from structured ops snapshot (no raw employee names)  
3. Async API route  
4. Non-blocking UI card  
5. Audit log  
6. Exception summary (phase 2)  

### Potential hidden technical debt

- No rate limiting on AI routes — cost exposure.
- Session data includes employee names — prompt builder must redact.

### Potential opportunities to simplify

- Morning brief only — skip exception AI in v1.
- Rule-based brief fallback (no LLM) for demo/offline.

### Potential reusable components

- Operations center card wrapper  

### Potential reusable services

- `operations-center/load-cards.ts` — snapshot for prompts  
- `telemetry.ts`  

### Potential reusable database models

Read-only operational models; optional `AiAuditLog`

### Recommended feature flags

`AI_BRIEF_ENABLED=false` (default), `AI_EXCEPTION_SUMMARY_ENABLED=false`

### Rollback complexity

**Low** — remove env keys and card.

### Notes

Never block Operations Center on LLM response. ADL-009: no new microservice — API route in monolith OK.

---

## Wave 11 — Organization & Multi-site Foundation

### Current implementation

- **Tenancy:** `facilityId` on JWT and every operational model (~30 models).
- **Organization:** `Facility.managementCompanyName` optional string only.
- **Product:** Single-facility per deployment assumption.
- **Auth payload:** `AppJwtPayload` — `facilityId` required, no orgId ([auth.ts](../ltc-manager/src/lib/auth.ts) lines 12–24).
- **Context:** `facility-context.ts` — single facility from session.
- **Billing:** Stripe customer on `Facility`.
- **Provisioning:** `scripts/provision-facility.mjs` — single facility stack.

### Target implementation

- `Organization` model; `Facility.organizationId` FK.
- Org admin role; site switcher in shell.
- JWT: `organizationId` + active `facilityId`.
- Cross-site leak tests on every query path.
- Org-level template library (log presets).
- Billing design at org level (may defer Stripe scope).

### Gap summary

| Gap | Severity |
|-----|----------|
| No Organization entity | Critical |
| facilityId-only JWT | Critical |
| ~30 models need leak audit | Critical |
| No site switcher | High |
| Single-facility onboarding | High |

### Complexity

**Very Large**

### Estimated engineering effort

**200 hours**

### Dependencies

Waves 1–8 stable; ADL-004

### Risk

**Very high** — tenancy bug = data leak across customers.

### Primary files affected

| File | Impact |
|------|--------|
| `prisma/schema.prisma` | Org models + FK |
| `src/lib/auth.ts` | JWT claims |
| `src/lib/facility-context.ts` | Org + site context |
| `src/proxy.ts` | Site validation |
| `src/components/app-shell.tsx` | Site switcher |
| `src/app/setup/page.tsx` | Org creation |
| `src/lib/onboarding.ts` | Org flow |
| `scripts/provision-facility.mjs` | Org provision |
| **All** `**/actions.ts` | Scope audit |

### Secondary files affected

`src/lib/stripe.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/signup/route.ts`, admin org settings, seed

### Database impact

**Very high** — migration + backfill default org per facility.

### Testing impact

**Critical** — automated cross-site isolation tests mandatory.

### Regression risk

**Very high** — single-site deploy must behave identically.

### Recommended implementation order

1. Schema + backfill migration (11a)  
2. Context helpers + JWT (11a)  
3. Site switcher UI + API (11b)  
4. Query audit grep + fix passes  
5. Onboarding org path  
6. Org template library stub  
7. Penetration spot check  

### Potential hidden technical debt

- Global unique constraints (`assetCode`, repair codes) break multi-facility same DB.
- In-memory PIN rate limit not shared across instances.
- Upload paths facility-scoped on disk — org-level assets unclear.

### Potential opportunities to simplify

- Phase 1: org groups facilities but users still single-site session — switcher only.
- Defer org billing; keep Stripe on Facility.

### Potential reusable components

- `department-scope-switcher.tsx` — pattern for site switcher  

### Potential reusable services

- `facility-context.ts` — extend to `getActiveSite()`  
- `prisma.ts` — middleware for facility scope (evaluate carefully)  

### Potential reusable database models

`Facility`, `User`, `OnboardingManagerInvite`

### Recommended feature flags

`ORG_MULTISITE_ENABLED=false` (mandatory until audit complete)

### Rollback complexity

**Very high** — prefer flag disable over schema revert.

### Notes

Do not add `organizationId` to every operational row in v1 — Facility FK sufficient (ADL-004).

---

## Wave 12 — Industry Configuration Layer

### Current implementation

- **Departments:** Seeded DIETARY, EVS, PLANT via `ensure-default-departments.ts` — hardcoded keys throughout.
- **Unit types:** LTC-heavy `UnitType` enum in schema.
- **Log presets:** `prisma/apply-log-template-presets.mjs` — LTC checklists.
- **HR enums:** `ChrcStatus`, `WorkStation`, etc. — LTC-specific.
- **EVS statuses:** `RoomAreaOperationalStatus` includes DISCHARGE, ISOLATION — clinical adjacency.
- **Nav:** `department-nav.ts` keys typed as literal union.
- **Provisioning:** No `--industry` flag.

### Target implementation

- `IndustryProfile` config (JSON or tables).
- `Facility.industryProfileId`.
- Data-driven department nav — remove hardcoded keys from TS.
- Neutral UI copy layer.
- Second pack demonstrable (K-12 or hospital dev).
- Provisioning accepts industry argument.
- Prisma enum names unchanged in v1 (ADL-006).

### Gap summary

| Gap | Severity |
|-----|----------|
| Hardcoded DIETARY/EVS/PLANT | Critical |
| LTC enums in shared schema | High |
| No IndustryProfile | Critical |
| UI copy LTC-specific | Medium |

### Complexity

**Very Large**

### Estimated engineering effort

**140 hours**

### Dependencies

Wave 11 preferred; Wave 1 nav refactor required

### Risk

**High** — missed hardcoded key breaks EVS or dietary nav silently.

### Primary files affected

| File | Impact |
|------|--------|
| `src/lib/department-nav.ts` | Remove literal union |
| `src/lib/ensure-default-departments.ts` | Pack-driven |
| `src/lib/unit-type-config.ts` | Pack-driven |
| `prisma/seed.mjs` | Pack-aware |
| `prisma/apply-log-template-presets.mjs` | Pack templates |
| `scripts/provision-facility.mjs` | `--industry` |
| `prisma/schema.prisma` | IndustryProfile |
| **New** `src/lib/industry/*.ts` | Loader + terminology |

### Secondary files affected

Most admin pages, EVS board labels, employee HR labels (`employee-hr-labels.ts`), reports, onboarding

### Database impact

**Medium** — IndustryProfile table + Facility FK; department keys remain slugs per facility.

### Testing impact

**Very high** — LTC parity regression suite vs second pack smoke test.

### Regression risk

**High** — LTC production behavior must be bit-for-bit equivalent under LTC pack.

### Recommended implementation order

1. IndustryProfile schema + LTC pack JSON (parity)  
2. Replace `OperationalDepartmentKey` union with runtime config  
3. Grep-driven hardcoded key elimination  
4. Terminology helper for UI strings  
5. Second pack dev seed  
6. Provision CLI flag  
7. Full LTC smoke test  

### Potential hidden technical debt

- `Department.key` used as foreign logic in repairs, logs, assets — must remain stable slugs not display names.
- EVS operational statuses in Prisma enum — cannot pack without code deploy until enum extraction strategy.
- 32 migrations — industry pack cannot easily change past enums.

### Potential opportunities to simplify

- LTC pack = current behavior exported to JSON — zero user-visible change day one.
- Terminology layer = single `t()` helper with pack dictionary.

### Potential reusable components

- Department switcher already dynamic from DB — leverage `Department.name`  

### Potential reusable services

- `ensure-default-departments.ts` — generalize to `applyIndustryPack()`  

### Potential reusable database models

`Department`, `Facility`, `LogTemplate`, `UnitType` (enum stays)

### Recommended feature flags

`INDUSTRY_PACK` env default `LTC`

### Rollback complexity

**Medium** — force LTC pack in code path.

### Notes

Full enum extraction to packs is post-v1. Wave 12 v1 = config + nav + copy, not schema enum renames.

---

# Modernization Backlog

Professional engineering backlog decomposed from twelve waves. **Total estimated: ~1,170 hours** (~29 person-weeks).

| ID | Title | Wave | Priority | Difficulty | Est. Hours | Dependencies | Status |
|----|-------|------|----------|------------|------------|--------------|--------|
| NAV-001 | Create `nav-zones.ts` zone enum and pathname mapper | 1 | Critical | Medium | 4 | None | Not Started |
| NAV-002 | Add zone metadata to route-permissions nav items | 1 | Critical | Medium | 6 | NAV-001 | Not Started |
| NAV-003 | Implement role-based default home resolver | 1 | Critical | Medium | 4 | NAV-001 | Not Started |
| NAV-004 | Refactor TopNav for zone-grouped navigation | 1 | Critical | Large | 10 | NAV-002 | Not Started |
| NAV-005 | Refactor AppShell layout for zone regions | 1 | Critical | Large | 8 | NAV-004 | Not Started |
| NAV-006 | Update LeftSidebar Operations Center link + structure | 1 | High | Small | 3 | NAV-001 | Not Started |
| NAV-007 | Relabel department switcher as operational mode lens | 1 | High | Tiny | 2 | None | Not Started |
| NAV-008 | Update AppRoute seed labels (Dashboard→Operations Center, Units→Locations) | 1 | High | Tiny | 2 | None | Not Started |
| NAV-009 | Add inactive `/today` route to seed for Wave 4 prep | 1 | Medium | Tiny | 1 | NAV-008 | Not Started |
| NAV-010 | Extend proxy allowlist for `/today` paths | 1 | Medium | Small | 2 | NAV-009 | Not Started |
| NAV-011 | Extract shared nav active-path utility | 1 | Low | Tiny | 2 | NAV-004 | Not Started |
| NAV-012 | Manual RBAC regression matrix + fix denials | 1 | Critical | Medium | 6 | NAV-005, NAV-010 | Not Started |
| NAV-013 | Unit tests for zone pathname mapping | 1 | High | Small | 4 | NAV-001 | Not Started |
| OPS-001 | Create `src/lib/operations-center/` directory structure | 2 | Critical | Tiny | 1 | Wave 1 | Not Started |
| OPS-002 | Extract dashboard unit/log/repair queries to loaders | 2 | Critical | Large | 10 | OPS-001 | Not Started |
| OPS-003 | Build card registry with exception-first priority | 2 | Critical | Medium | 8 | OPS-002 | Not Started |
| OPS-004 | Implement operation/meal period header banner | 2 | Critical | Medium | 6 | OPS-002 | Not Started |
| OPS-005 | Implement site pulse summary component | 2 | High | Medium | 4 | OPS-003 | Not Started |
| OPS-006 | Recompose dashboard page using card registry | 2 | Critical | Large | 12 | OPS-003, OPS-004 | Not Started |
| OPS-007 | Relocate or demote employees tab from manager home | 2 | Medium | Small | 4 | OPS-006 | Not Started |
| OPS-008 | Rename Dashboard to Operations Center in all UI | 2 | High | Tiny | 2 | Wave 1 | Not Started |
| OPS-009 | Optional `/operations` redirect to `/dashboard` | 2 | Low | Tiny | 1 | OPS-008 | Not Started |
| OPS-010 | Shared `getTodayWindow()` util (dashboard + unit) | 2 | Medium | Tiny | 2 | OPS-002 | Not Started |
| OPS-011 | Manager 60-second acceptance manual test script | 2 | High | Small | 3 | OPS-006 | Not Started |
| OPS-012 | Feature flag `OPS_CENTER_V2` | 2 | Medium | Tiny | 1 | OPS-006 | Not Started |
| READY-001 | Define readiness types and blocked rules (test-first) | 6 | Critical | Medium | 6 | OPS-002 | Not Started |
| READY-002 | Implement batch `computeUnitReadiness` for all units | 6 | Critical | Large | 10 | READY-001 | Not Started |
| READY-003 | Create ReadinessChip component | 6 | High | Small | 4 | READY-001 | Not Started |
| READY-004 | Wire readiness batch query in AppShell → sidebar | 6 | High | Medium | 6 | READY-002, NAV-005 | Not Started |
| READY-005 | Wire site pulse on Operations Center | 6 | High | Medium | 4 | READY-002, OPS-005 | Not Started |
| UNIT-001 | Extract unit page data loaders to lib | 3 | Critical | Large | 8 | OPS-010 | Not Started |
| UNIT-002 | Define work queue sort order (logs, servery, issues) | 3 | Critical | Medium | 4 | UNIT-001 | Not Started |
| UNIT-003 | Recompose unit page layout queue-first | 3 | Critical | Large | 12 | UNIT-002 | Not Started |
| UNIT-004 | Add operation context header to unit workspace | 3 | High | Medium | 4 | OPS-004, UNIT-001 | Not Started |
| UNIT-005 | Slim embedded log submit UX for floor | 3 | High | Medium | 6 | UNIT-003 | Not Started |
| UNIT-006 | Kiosk/tablet density pass on unit page | 3 | High | Medium | 4 | UNIT-003 | Not Started |
| UNIT-007 | Reserve quick-action slot for issue form (Wave 8) | 3 | Medium | Tiny | 1 | UNIT-003 | Not Started |
| UNIT-008 | Wire readiness chip on unit workspace | 3 | Medium | Small | 3 | READY-003, UNIT-003 | Not Started |
| UNIT-009 | PIN flow regression test (log + servery ≤3 taps) | 3 | Critical | Small | 3 | UNIT-005, UNIT-006 | Not Started |
| TODAY-001 | Seed `/today` route with supervisor+ permissions | 4 | Critical | Tiny | 2 | NAV-009 | Not Started |
| TODAY-002 | Create `todays-work/walk-list.ts` loader | 4 | Critical | Medium | 8 | READY-002 | Not Started |
| TODAY-003 | Build Today's Work hub page `/today` | 4 | Critical | Medium | 6 | TODAY-001 | Not Started |
| TODAY-004 | Build walk list page SCR-03 | 4 | Critical | Large | 10 | TODAY-002, TODAY-003 | Not Started |
| TODAY-005 | Build coverage page SCR-04 + staffing deep links | 4 | Critical | Large | 10 | TODAY-003 | Not Started |
| TODAY-006 | Call-down reason templates on AssignmentOverride create | 4 | High | Medium | 6 | TODAY-005 | Not Started |
| TODAY-007 | Open call-down list loader + Operations Center card | 4 | High | Medium | 6 | TODAY-006, OPS-003 | Not Started |
| TODAY-008 | Build handoffs page SCR-05 v0 (failed logs + open repairs) | 4 | Medium | Medium | 8 | TODAY-003 | Not Started |
| TODAY-009 | Supervisor vs staff permission tests for `/today` | 4 | Critical | Small | 4 | TODAY-004 | Not Started |
| TODAY-010 | Feature flag `TODAYS_WORK_ENABLED` | 4 | Medium | Tiny | 1 | TODAY-003 | Not Started |
| OPER-001 | Design OperationDefinition + OperationInstance schema | 5 | Critical | Large | 8 | Wave 4 | Not Started |
| OPER-002 | Prisma migration for operation models | 5 | Critical | Medium | 4 | OPER-001 | Not Started |
| OPER-003 | Implement `resolveActiveOperation()` lib | 5 | Critical | Large | 12 | OPER-002 | Not Started |
| OPER-004 | Daily operation instance sync job/script | 5 | Critical | Medium | 8 | OPER-003 | Not Started |
| OPER-005 | Wire Operations Center header to OperationInstance | 5 | High | Medium | 4 | OPER-003, OPS-004 | Not Started |
| OPER-006 | Wire unit workspace header to OperationInstance | 5 | High | Medium | 4 | OPER-003, UNIT-004 | Not Started |
| OPER-007 | Scope log due queries by operation instance | 5 | High | Large | 10 | OPER-003 | Not Started |
| OPER-008 | Scope staffing queries by operation instance | 5 | High | Large | 10 | OPER-003 | Not Started |
| OPER-009 | Link ServeryMealServiceEvent to operation instance (nullable FK) | 5 | Medium | Medium | 6 | OPER-002 | Not Started |
| OPER-010 | Feature flag `OPERATION_ENGINE_ENABLED` + fallback | 5 | Critical | Small | 3 | OPER-003 | Not Started |
| OPER-011 | Migration + timezone boundary test suite | 5 | Critical | Large | 8 | OPER-002 | Not Started |
| READY-006 | ReadinessSnapshot schema (v1) | 6 | Medium | Medium | 4 | OPER-003 | Not Started |
| READY-007 | Missed log detection background script | 6 | Medium | Large | 12 | OPER-007 | Not Started |
| READY-008 | Integrate EVS RoomAreaStatus into readiness (EVS mode) | 6 | Low | Medium | 6 | READY-002 | Not Started |
| READY-009 | Readiness unit test suite (all blocked branches) | 6 | Critical | Medium | 6 | READY-001 | Not Started |
| WORK-001 | Design Task model + TaskType enum | 7 | Critical | Large | 8 | Wave 6 | Not Started |
| WORK-002 | Prisma migration for Task table | 7 | Critical | Medium | 4 | WORK-001 | Not Started |
| WORK-003 | Implement log-task adapter (dual-write on submit) | 7 | Critical | Large | 16 | WORK-002 | Not Started |
| WORK-004 | Implement repair-task adapter (dual-write on create/update) | 7 | Critical | Very Large | 20 | WORK-002 | Not Started |
| WORK-005 | Feature flag `TASK_SYNC_ENABLED` + verification tests | 7 | Critical | Medium | 6 | WORK-003, WORK-004 | Not Started |
| WORK-006 | Design Inspection + InspectionSubmission models | 7 | High | Large | 8 | WORK-001 | Not Started |
| WORK-007 | Inspection migration | 7 | High | Medium | 4 | WORK-006 | Not Started |
| WORK-008 | Inspection submit flow (minimal UI) | 7 | High | Large | 16 | WORK-007 | Not Started |
| WORK-009 | Internal task inbox query API (lib only) | 7 | Medium | Medium | 8 | WORK-005 | Not Started |
| WORK-010 | Log/repair user-facing regression suite | 7 | Critical | Large | 8 | WORK-005 | Not Started |
| ISSUE-001 | Add issueType enum/column to Repair with migration default | 8 | Critical | Medium | 6 | Wave 7 | Not Started |
| ISSUE-002 | Update repair-routing for issue types | 8 | Critical | Medium | 6 | ISSUE-001 | Not Started |
| ISSUE-003 | Dietary unit quick issue form (drawer) | 8 | Critical | Medium | 8 | UNIT-007 | Not Started |
| ISSUE-004 | Supply short issue type + create action | 8 | Critical | Medium | 8 | ISSUE-001, ISSUE-003 | Not Started |
| ISSUE-005 | Operations Center open issues card by type | 8 | High | Medium | 4 | ISSUE-001, OPS-003 | Not Started |
| ISSUE-006 | Extend EVS quick ticket with issue type | 8 | High | Small | 3 | ISSUE-001 | Not Started |
| ISSUE-007 | Issue detail page SCR-06 | 8 | Medium | Large | 12 | ISSUE-001 | Not Started |
| ISSUE-008 | Wire issue severity to readiness blocked rules | 8 | High | Small | 4 | ISSUE-001, READY-001 | Not Started |
| ISSUE-009 | Repair/report regression tests | 8 | Critical | Medium | 4 | ISSUE-002 | Not Started |
| KNOW-001 | KnowledgeArticle schema + migrations | 9 | Critical | Medium | 6 | Wave 7 | Not Started |
| KNOW-002 | Knowledge CRUD server actions | 9 | Critical | Large | 12 | KNOW-001 | Not Started |
| KNOW-003 | Template instruction link on LogTemplate | 9 | High | Medium | 6 | KNOW-002 | Not Started |
| KNOW-004 | Log submit instruction panel | 9 | High | Medium | 6 | KNOW-003 | Not Started |
| KNOW-005 | Unit workspace contextual help drawer | 9 | High | Medium | 8 | KNOW-002, UNIT-003 | Not Started |
| KNOW-006 | Manager knowledge search page | 9 | Medium | Large | 12 | KNOW-002 | Not Started |
| KNOW-007 | Index union handbook in knowledge layer | 9 | Medium | Medium | 6 | KNOW-002 | Not Started |
| KNOW-008 | Department-scoped knowledge filters | 9 | High | Medium | 4 | KNOW-002 | Not Started |
| KNOW-009 | Handbook API regression test | 9 | Critical | Tiny | 2 | KNOW-007 | Not Started |
| AI-001 | AI provider abstraction + env configuration | 10 | Critical | Medium | 8 | Wave 8 | Not Started |
| AI-002 | Structured ops snapshot builder for prompts (PII-safe) | 10 | Critical | Large | 12 | OPS-003, READY-002 | Not Started |
| AI-003 | Morning brief prompt template + validation | 10 | High | Medium | 8 | AI-002 | Not Started |
| AI-004 | Async `/api/ai/brief` route with timeout | 10 | High | Medium | 8 | AI-001, AI-003 | Not Started |
| AI-005 | Non-blocking Morning Brief card on Operations Center | 10 | High | Medium | 6 | AI-004, OPS-006 | Not Started |
| AI-006 | AI audit log (optional schema) | 10 | Medium | Medium | 6 | AI-004 | Not Started |
| AI-007 | Feature flags AI_BRIEF_ENABLED (default off) | 10 | Critical | Tiny | 1 | AI-005 | Not Started |
| AI-008 | Exception summarization (phase 2) | 10 | Low | Large | 16 | AI-005 | Not Started |
| AI-009 | Cost/rate limit guard on AI routes | 10 | High | Medium | 6 | AI-004 | Not Started |
| ORG-001 | Organization schema + Facility.organizationId migration | 11 | Critical | Large | 12 | Wave 8 | Not Started |
| ORG-002 | Backfill default Organization per existing Facility | 11 | Critical | Medium | 6 | ORG-001 | Not Started |
| ORG-003 | Extend JWT with organizationId claim | 11 | Critical | Medium | 8 | ORG-001 | Not Started |
| ORG-004 | Update facility-context for org + active site | 11 | Critical | Medium | 8 | ORG-003 | Not Started |
| ORG-005 | Site switcher UI + switch API | 11 | Critical | Large | 16 | ORG-004, NAV-005 | Not Started |
| ORG-006 | Cross-site data leak audit (all actions.ts) | 11 | Critical | Very Large | 24 | ORG-004 | Not Started |
| ORG-007 | Automated cross-site isolation tests | 11 | Critical | Large | 12 | ORG-006 | Not Started |
| ORG-008 | Org-aware onboarding path | 11 | High | Large | 16 | ORG-001 | Not Started |
| ORG-009 | Update provision-facility script for org | 11 | High | Medium | 6 | ORG-001 | Not Started |
| ORG-010 | Feature flag ORG_MULTISITE_ENABLED | 11 | Critical | Tiny | 1 | ORG-005 | Not Started |
| ORG-011 | Org-level log template library stub | 11 | Low | Large | 12 | ORG-001 | Not Started |
| IND-001 | IndustryProfile schema + LTC pack JSON (parity export) | 12 | — | — | — | — | **Will-not-do** — industry packs retired |
| IND-002 | Replace OperationalDepartmentKey union with runtime config | 12 | — | — | — | — | **Will-not-do** — industry packs retired |
| IND-003 | Generalize ensure-default-departments to applyIndustryPack | 12 | — | — | — | — | **Will-not-do** — `applyIndustryPack()` will not be implemented |
| IND-004 | Pack-driven unit-type-config | 12 | — | — | — | — | **Will-not-do** — industry packs retired |
| IND-005 | Pack-driven log template presets | 12 | — | — | — | — | **Will-not-do** — Harbor install + place |
| IND-006 | Terminology helper `t()` for neutral UI copy | 12 | — | — | — | — | **Will-not-do** — not a pack program |
| IND-007 | Grep pass: eliminate hardcoded DIETARY/EVS/PLANT in TS | 12 | — | — | — | — | **Will-not-do** as a pack ticket |
| IND-008 | Second industry pack seed (K-12 dev demo) | 12 | — | — | — | — | **Will-not-do** — industry packs retired |
| IND-009 | provision-facility `--industry` flag | 12 | — | — | — | — | **Will-not-do** — industry packs retired |
| IND-010 | LTC parity full smoke test under IndustryProfile | 12 | — | — | — | — | **Will-not-do** — industry packs retired |

---

# Engineering Risk Register

| Risk | Likelihood | Impact | Mitigation | Owner | Status |
|------|------------|--------|------------|-------|--------|
| Navigation regression (wrong links, missing modules) | Medium | High | NAV-012 manual matrix; preserve URLs; feature flag | Eng | Open |
| Permission regression (403/redirect loops) | Medium | Critical | Extend route-permissions tests; proxy integration checks | Eng | Open |
| Department allowlist regression (EVS/dietary bleed) | Medium | High | Test all 3 modes × top routes; longest-prefix rule unit tests | Eng | Open |
| Facility scope leak (cross-facility data) | Low (today) / High (Wave 11) | Critical | ORG-006 audit + ORG-007 automated tests before org flag on | Eng | Open |
| Organization migration failure | Medium | Critical | Staging clone; forward-only migrations; ORG_MULTISITE_ENABLED flag | Eng | Open |
| Task dual-write inconsistency | Medium | Critical | TASK_SYNC_ENABLED flag; WORK-010 regression; transactions | Eng | Open |
| Log compliance pipeline break | Low | Critical | ADL-007: never replace logs; adapter only; immutability tests | Eng | Open |
| Schema migration failure in production | Medium | High | Backup before deploy; migrate deploy not dev; AGENTS.md rules | Eng | Open |
| Sidebar readiness query explosion (N+1) | High | Medium | Batch compute in AppShell once; READY-002 design review | Eng | Open |
| Dashboard query performance regression | Medium | Medium | Extract loaders; measure P95 on seeded 20-unit facility | Eng | Open |
| Operation engine timezone bugs | High | Medium | OPER-011 test suite; document TZ assumption | Eng | Open |
| Industry abstraction incomplete (silent hardcoded keys) | High | High | IND-007 grep CI check; LTC parity test IND-010 | Eng | Open |
| AI latency blocking Operations Center | Medium | High | Async route; AI off by default; timeout fallback | Eng | Open |
| AI hallucination in operational decisions | Medium | High | Brief only; no automated actions; human-readable disclaimer | Eng | Open |
| AI PII leakage in prompts | Low | Critical | AI-002 redaction layer; audit prompts | Eng | Open |
| Kiosk unit layout regression | Medium | Medium | UNIT-009 PIN test on tablet viewport | Eng | Open |
| Repair routing break on issue types | Medium | High | ISSUE-009 regression; EVS path ISSUE-006 | Eng | Open |
| Stripe/org billing scope creep | Medium | Medium | Defer org billing; ADL-003 keep Facility customer | PM/Eng | Open |
| Global assetCode uniqueness (multi-site) | High (Wave 11) | Medium | Scope codes per facility in org wave design note | Eng | Open |
| In-memory PIN rate limit (multi-instance) | Medium | Low | Document; Redis noted in architecture review | Eng | Open |
| Local disk uploads (multi-instance) | Medium | Medium | KNOW layer storage abstraction; object storage backlog | Eng | Open |
| Readiness false blocked (ops noise) | Medium | Medium | READY-009 tests; tunable thresholds | Eng | Open |
| Readiness false complete (missed risk) | Low | High | Conservative blocked rules; missed log job READY-007 | Eng | Open |

---

# Engineering Heat Map

Files ranked by modification frequency and blast radius during modernization.

## Critical (refactor early, stabilize with tests before dependent waves)

| File | Lines | Why it changes | Waves | Refactor early? | Stabilize before? |
|------|-------|----------------|-------|-----------------|-------------------|
| `src/components/app-shell.tsx` | 131 | Every-page chrome; zone model; readiness props; site switcher | 1,2,4,6,11 | **Yes** — Wave 1 | Wave 2+ |
| `src/lib/route-permissions.ts` | 190 | Nav items, RBAC, default home, zone grouping | 1,4,11,12 | **Yes** — Wave 1 | All |
| `src/lib/department-nav.ts` | 84 | Mode filter; industry pack removes hardcoded keys | 1,4,12 | **Yes** — Wave 1 | Wave 12 |
| `src/proxy.ts` | 101 | Auth, RBAC, dept allowlist, new routes | 1,4,11 | Stabilize in Wave 1 | Wave 11 |
| `src/app/(protected)/dashboard/page.tsx` | 482 | Operations Center; cards; AI brief; call-downs | 2,4,6,8,10 | Split in Wave 2 | Wave 5 |
| `src/lib/auth.ts` | ~130 | JWT shape for org/site | 11 | No — Wave 11 only | Wave 11 |
| `prisma/schema.prisma` | 1027 | Operation, Task, Issue, Knowledge, Org, Industry | 5,7,8,9,11,12 | No — per wave | Each migration |

## High

| File | Lines | Why | Waves | Early? | Stabilize? |
|------|-------|-----|-------|--------|------------|
| `src/components/top-nav.tsx` | 52 | Zone UI | 1 | Yes | Wave 1 |
| `src/components/left-sidebar.tsx` | 64 | Locations rail, readiness chips | 1,2,6 | Yes | Wave 6 |
| `src/app/(protected)/unit/[unitId]/page.tsx` | 583 | Unit workspace layout | 3,6,8,9 | Split Wave 3 | Wave 8 |
| `src/app/(protected)/logs/actions.ts` | 347 | Task sync; operation scope | 5,7 | No | Wave 7 |
| `src/app/(protected)/repairs/actions.ts` | 447 | Task sync; issue types | 7,8 | No | Wave 8 |
| `src/lib/facility-context.ts` | ~small | Tenancy; org context | 11 | No | Wave 11 |
| `src/lib/servery-meal-service.ts` | 53 | Meal period; operation link | 2,3,5 | Extend Wave 2 | Wave 5 |
| `prisma/seed.mjs` | ~400+ | Routes, permissions, packs | 1,4,12 | Wave 1 | Each wave |

## Medium

| File | Why | Waves |
|------|-----|-------|
| `src/app/(protected)/staffing/page.tsx` + `actions.ts` | Coverage, call-downs, operation scope | 4,5 |
| `src/lib/repair-routing.ts` | Issue types | 8 |
| `src/app/(protected)/evs/actions.ts` | Issue pattern | 8 |
| `src/components/department-scope-switcher.tsx` | Mode lens copy | 1,12 |
| `src/lib/active-department-context.ts` | Dept resolution | 1,12 |
| `src/components/units-manager.tsx` | Inspections, cadence | 7 |
| `src/lib/facility-uploads.ts` | Knowledge files | 9,11 |
| `src/app/(protected)/reports/page.tsx` | Review zone labeling | 1,2 |

## Low (minimal or late-touch)

| File | Why | Waves |
|------|-----|-------|
| `src/app/(protected)/employees/**` | Admin zone; HR stable | 1 (label only) |
| `src/app/(protected)/admin/**` | Administration zone | 1,9,11 |
| `src/app/(protected)/menus/**` | Dietary module; operation link optional | 5 |
| `src/lib/hr-audit.ts`, employee import | HR stable | — |
| `src/lib/stripe.ts` | Billing; org optional | 11 |
| `src/lib/telemetry.ts` | AI events | 10 |
| Auth API routes | Session shape Wave 11 | 11 |

---

# Quick Wins

Improvements with **high product value / low engineering effort** — include within existing waves without roadmap changes.

| ID | Quick win | Wave | Est. | Value |
|----|-----------|------|------|-------|
| QW-01 | Rename sidebar "Dashboard" → "Operations Center" | 1 | 0.5h | Immediate certified language |
| QW-02 | Seed label Dashboard → Operations Center, Units → Locations | 1 | 0.5h | Top nav alignment |
| QW-03 | Footer neutral copy ("Operations workspace" vs "Nutrition operations") | 1 | 0.5h | ADL-006 partial |
| QW-04 | Extract `fmtMealLabel()` duplicate from dashboard + unit to servery lib | 2 | 1h | DRY before split |
| QW-05 | Extract `getTodayWindow()` shared util | 2 | 1h | Enables loaders |
| QW-06 | Move birthdays card below fold without full card registry | 2 | 2h | Partial exception-first |
| QW-07 | Left sidebar header already "Locations" — remove duplicate "Units" in seed only | 1 | 0.5h | Consistency |
| QW-08 | Use `module-placeholder.tsx` for `/today` stub until Wave 4 | 1 | 1h | Zone completeness |
| QW-09 | Add `clearRoutePermissionCache()` call after admin permission save if missing | 1 | 1h | Prevent stale nav |
| QW-10 | Document deep-link contract for staffing (`?date=&unitId=`) before Wave 4 | 4 | 1h | Coverage page prep |
| QW-11 | Call-down list v0: filter today's AssignmentOverrides where reason contains "call" | 4 | 2h | No schema |
| QW-12 | Reports page title "Review" in breadcrumb/zone indicator | 1–2 | 1h | Zone labeling |
| QW-13 | Remove dead `/settings` redirect path if unused (proxy lines 73–77) | 1 | 0.5h | Simplify routing |
| QW-14 | Consolidate `isActivePath` logic (NAV-011) | 1 | 2h | Maintenance |
| QW-15 | Readiness v0 in Wave 2 bundle (READY-001–005) — avoid second dashboard pass | 2+6 | 24h | High — recommended bundle |

**Total quick wins (excl. QW-15): ~12 hours** — fit inside Wave 1–2 buffers.

---

# Suggested Execution Order

## Certification

**The certified twelve-wave sequence in [01_MODERNIZATION_ROADMAP.md](./01_MODERNIZATION_ROADMAP.md) is the recommended execution order.** No reordering of wave numbers is proposed.

## Rationale

1. **Wave 1 is mandatory first** — every surface depends on zone-based IA; codebase confirms module-first nav with no zone lib (`top-nav.tsx` renders flat `AppRoute` list).
2. **Waves 2–4 form Bundle A** — delivers certified three homes without schema risk; aligns with ADL-005 dietary wedge and [FIRST_PRODUCT_SLICE.md](../platform-vision/FIRST_PRODUCT_SLICE.md).
3. **Wave 5 before Wave 6 v1** — operation-scoped readiness needs OperationInstance; v0 readiness may precede Wave 5 but v1 should not.
4. **Wave 7 before Wave 8** — issue/task linkage cleaner after Task adapters exist; Wave 8 supply short can use Repair-only path if Task slips.
5. **Waves 9–10 after operational core** — knowledge and AI require stable work surfaces.
6. **Waves 11–12 last** — highest tenancy and abstraction risk; ADL-003/004 explicitly defer org until slice stable.

## Execution refinements (within certified order)

These are **sub-order optimizations**, not wave renumbering:

| Refinement | Detail |
|------------|--------|
| **6-v0 inside Wave 2** | Ship READY-001–005 with OPS-006 to avoid revisiting dashboard layout. Certified in roadmap sequence note. |
| **Wave 3 parallel to late Wave 2** | After NAV-005 lands, unit page work can start if meal header contract is shared via servery lib. |
| **Wave 4 after 6-v0** | Walk list ordering needs readiness signals — do TODAY-004 after READY-002. |
| **7a before 7b** | Task sync invisible release before inspection UI. |
| **8a before 8b** | Quick forms before issue detail page. |
| **11a before 11b** | Schema + JWT before site switcher UI. |

## Not recommended

| Change | Why rejected |
|--------|--------------|
| Move Wave 11 before Wave 7 | Org tenancy multiplies Task/Issue migration complexity |
| Move Wave 5 before Wave 2 | Operation engine without Operations Center surface adds integration risk without user value |
| Skip Wave 1 | Department-nav and proxy hardcoding makes all later UX work unstable |
| Combine Waves 7+8 into one release | Too large blast radius on repairs/logs compliance |

---

## Appendix: Codebase discovery notes

| Observation | Location | Implication |
|-------------|----------|-------------|
| Sidebar already says "Locations" | `left-sidebar.tsx:29` | Partial Wave 1 done |
| Sidebar still links "Dashboard" | `left-sidebar.tsx:32-34` | QW-01 |
| No zone lib exists | — | NAV-001 critical path |
| Dashboard monolith 482 lines | `dashboard/page.tsx` | OPS-002 required before features |
| Unit monolith 583 lines | `unit/[unitId]/page.tsx` | UNIT-001 same pattern |
| inspectionFrequency metadata only | `units-manager.tsx`, schema | WORK-006–008 |
| EVS quick repair exists | `evs/actions.ts` | ISSUE-003 template for dietary |
| JWT facilityId only | `auth.ts:18` | ORG-003 |
| Proxy denies to `/dashboard` always | `proxy.ts:80,87` | May need zone-aware fallback in Wave 1 |
| route-permissions 30s cache | `route-permissions.ts:16` | Invalidate on admin changes |
| Tests exist only for route-permissions + credential-policy | `*.test.ts` | Expand from Wave 1 |

---

**Document complete.** Next step: execute Wave 1 using [06_WAVE_EXECUTION_TEMPLATE.md](./06_WAVE_EXECUTION_TEMPLATE.md) and backlog items NAV-001 through NAV-013.
