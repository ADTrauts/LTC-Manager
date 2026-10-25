# LTC Manager — RUN Guide

**Mode:** RUN — *Operate today.*
**Companion docs:** `LTC_MANAGER_BUILD_RUN_INFORMATION_ARCHITECTURE_2026-08-08.md`, `LTC_MANAGER_BUILD_GUIDE.md`, `LTC_MANAGER_ADMIN_BOUNDARY.md`

---

## What RUN is

RUN is where the operation happens **today**. It is the default mode for every role. Managers, supervisors, and frontline staff all start here. RUN is department-aware: the same surfaces render as Dietary, EVS, or Plant compositions depending on the active department context.

## Canonical RUN navigation

| Area | Route | Who | What it is |
|------|-------|-----|-----------|
| **Dashboard** | `/dashboard` | Supervisor and above | Home. `/workspace` and `/today` only redirect here. |
| **Locations** | `/units` → `/unit/[id]` | Supervisor+ / scoped | Facility hierarchy (Floor → Neighborhood/Unit → Room/Space). Structural nodes expand; actionable nodes open runtime. |
| **Employees** | `/staffing` | Supervisor+ | Today's workforce: schedule visibility, attendance, assignments, coverage. *Not* workforce configuration. |
| **Logs** | `/staffing/logs` when `CANONICAL_LOGS_ENABLED`; otherwise legacy `/logs` | Staff+ | Due operational Records — what must be recorded now. |
| **Log Book** | `/staffing/log-book` | Supervisor+ | Historical projection over `OperationalEvidenceRecord`. Not the due-work queue. |
| **Assets** | `/assets` | Supervisor+ / scoped | Operational asset view: status, evidence, issues, requests, work orders. Vendors sub-tab. |
| **Repairs** | `/repairs` | Staff+ / scoped | Repair / work-order runtime. |
| **Review** | `/reports` | Manager+ | Derived expected-versus-actual analysis. Not a submitted-evidence store. |
| **Legacy Logs** | `/logs` | Staff+ | Compatibility while canonical Logs are off. Historical `LogSubmission` reads remain when the flag is on. |

Plus role-scoped runtime: Schedule, Locations, Rounds, Handoffs, Operational Cycles, Requests, Issues, Asset Issues — all reachable in context.

## Role homes in RUN

- **Frontline Employee (Quick PIN):** lands directly in their department's runtime — Unit Workspace / Job Flow / current assignment. RUN-only; never sees Build or Admin.
- **Supervisor and above:** land on the Dashboard.

## Department behavior in RUN

- **Dietary** (time/service): Dashboard, Locations, Employees, Log Book, Cycles, Menus (build), Job Flow runtime.
- **EVS** (location/work): Dashboard, Locations (zones), Employees, Work runtime, thin Assets.
- **Plant** (request/asset/repair): Dashboard, Locations, Requests/intake, Assets, Repairs / Work Orders.

Meal-specific surfaces appear only for Dietary. EVS zone surfaces appear only where EVS/Plant use zones. Nothing department-specific leaks into a department that does not use it (nav is filtered by `filterNavItemsForDepartmentScope` + department activation).

## What does NOT belong in RUN

- Workforce configuration (Employee Builder → BUILD).
- Asset configuration / retirement (Asset Builder composition → BUILD).
- Template / checklist / inspection authoring (Operational Templates → BUILD).
- Facility structure editing (Facility Builder → BUILD).
- Organization / facility / access governance (→ ADMIN).

## UX states (RUN)

Every RUN surface uses the shared page-header, breadcrumb ("Run / Area"), empty state, feature-disabled state, loading, error, and offline-indicator patterns. When a department capability is off, its RUN nav disappears; direct URLs remain server-authorized and the page renders its own disabled/empty state.
