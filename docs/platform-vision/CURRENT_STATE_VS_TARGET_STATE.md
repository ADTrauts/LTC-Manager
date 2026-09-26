# Current State vs Target State

> **Retired (2026-09-25):** Target rows for Operation entity, industry packs, and Experience-style expansion are historical. See [RETIRED.md](./RETIRED.md).

**Status:** Planning document — historical  
**Source of truth (current):** [docs/architecture-review/](../architecture-review/)  
**Target vision:** [PRODUCT_CONSTITUTION.md](./PRODUCT_CONSTITUTION.md), [DOMAIN_MODEL_TARGET.md](./DOMAIN_MODEL_TARGET.md)  
**Date:** 2026-07-07

Comparison of the **existing codebase** to the **platform vision**. Categories:

| Category | Meaning |
|----------|---------|
| **Preserve** | Working patterns and models to keep and extend |
| **Refactor later** | Valuable today but should evolve toward target without blocking the first slice |
| **Missing foundation** | Required by target vision; not present or only stubbed |

---

## Summary matrix

| Concept | Current state | Target state | Category |
|---------|---------------|--------------|----------|
| Facility | `Facility` model, JWT `facilityId`, single-site product | **Site** under **Organization**; multi-site rollup | Preserve (now) + Missing foundation (org) |
| Organization | `managementCompanyName` string on Facility | First-class **Organization** entity | Missing foundation |
| Department | Per-facility `Department`, nav scoping, routing | Configurable **operational departments** per site + industry packs | Preserve |
| Unit / Location | `Unit` model, sidebar, dashboards | **Location** as universal term; same anchor | Preserve |
| Operation | Implicit (meal periods, shifts, daily rhythm) | Explicit **Operation** / **operational mode** (Dietary, EVS, Plant) | Refactor later |
| Task | Not modeled | Unified **Task** for episodic work | Missing foundation |
| Log | `LogTemplate` → assignment → submission | **Compliance log** as specialized task/checklist | Preserve |
| Asset | `Asset` + `Vendor` | **Asset** + ownership/routing by department | Preserve |
| Supply item | Not modeled | **SupplyItem**, PAR, depletion, call-down triggers | Missing foundation |
| Issue | `Repair` work orders | **Issue** superset (equipment, supply, safety, HK) | Refactor later |
| User / role / scope | `User` + `Employee`, `RoleKey`, route matrix, dept cookie | Scoped **principal** + capability by role × location × mode | Preserve + Refactor later |

---

## Facility

### Current

- `Facility` is tenancy root: billing, onboarding, branding, handbook, all operational data scoped by `facilityId`.
- Session JWT requires `facilityId`; proxy enforces scope.
- Product assumes **one facility per deployment**; multi-facility in DB is possible but not exposed.
- UI label: facility display name in app shell.

### Target

- **Site** (implementation: `Facility` until migration) is one physical or logical campus/building where operations run.
- Sites belong to an **Organization** (contract operator, district, health system).
- Cross-site dashboards and shared templates roll up at org level.
- Billing and SSO may attach to Organization.

### Verdict

| Preserve | Refactor later | Missing foundation |
|----------|----------------|-------------------|
| `facilityId` scoping; onboarding and Stripe on site; brand per site | Rename product language Site vs Facility; facility-scoped unique codes for assets/repairs | **Organization** entity; org ↔ site hierarchy; org-level admin session |

---

## Organization / operating company

### Current

- `Facility.managementCompanyName` — optional display string only.
- `OnboardingManagerInvite` — emails captured, no delivery or org linkage.
- Contract dining ICP documented in strategy; not modeled.

### Target

- **Organization** owns many sites, shared employee pool (optional), template libraries, and billing.
- Operating company users switch site context or see district rollup.
- Manager invites issued by org or site with workflow.

### Verdict

| Preserve | Refactor later | Missing foundation |
|----------|----------------|-------------------|
| Management company name field as interim display | Promote string to relation when org ships | **Organization** model; org admin roles; cross-site navigation; shared preset distribution |

---

## Department

### Current

- `Department` per facility: `key`, `name`, `sortOrder`, `headEmployeeId`, `showInEmployeeApp`.
- Default keys: DIETARY, EVS, PLANT (seeded).
- Links: units (`UnitDepartmentResponsibility`), employees, assets, repairs, logs, work shifts.
- Nav scoping via `department-nav.ts` — **hardcoded keys** for three departments.

### Target

- Departments are **operational lanes** configurable per site (dietary, EVS, plant, housekeeping, retail, etc.).
- Industry packs suggest default department sets (hospital vs K-12 vs LTC).
- Nav rules driven by **department metadata**, not code constants.

### Verdict

| Preserve | Refactor later | Missing foundation |
|----------|----------------|-------------------|
| Department model; head assignment; unit responsibilities; employee membership | Data-driven department nav; rename DIETARY → "Food Service" in neutral UI | Industry pack registry; optional org-wide department templates |

---

## Unit / Location

### Current

- `Unit`: name, `UnitType` enum, hierarchy, meal times, active/order.
- Sidebar label **Locations**; `/unit/[unitId]` dashboards.
- PIN unit access; kiosk unit lock.
- No separate "Location" table.

### Target

- **Location** is the universal product term; unit types extensible per vertical (servery, dining hall, classroom wing, OR suite).
- Readiness state per location per day/shift (see Operation).
- Same navigation and execution anchor.

### Verdict

| Preserve | Refactor later | Missing foundation |
|----------|----------------|-------------------|
| Entire unit model, sidebar, dashboards, meal times, hierarchy | UI copy Location vs Unit; generalize `UnitType` beyond LTC-heavy enums | Formal **readiness** aggregate (beyond logs + servery events + room status) |

---

## Operation

### Current

- **Implicit** rhythm: `MealType`, `ServeryMealServiceEvent`, `ScheduleEntry.shift`, `WorkShift`, menu cycle.
- Department cookie = coarse "mode" (dietary / EVS / plant).
- No `Operation` entity.

### Target

- **Operation** = bounded operational rhythm: e.g. "Breakfast service 2026-07-07," "EVS evening round," "PM filter change week."
- Operations link staffing expectations, logs due, readiness checks, and issues for that window.
- **Operational mode** selects module presets (Dietary Operational Mode vs EVS Mode).

### Verdict

| Preserve | Refactor later | Missing foundation |
|----------|----------------|-------------------|
| Servery events, meal periods, shifts as building blocks | Extract "today's dietary operation" view without new table first | **Operation** (or **OperationInstance**) entity; operation-scoped dashboard |

---

## Task

### Current

- **Not modeled.**
- Proxies: `LogSubmission` (compliance), `Repair` (maintenance), `AssignmentOverride` (staffing change).

### Target

- **Task** = assignable, completable unit of work with status, assignee, location, due window.
- Subtypes: log task (compliance), issue task, supply task, ad-hoc supervisor task.
- Call-downs and "someone needs to cover 4A" are tasks.

### Verdict

| Preserve | Refactor later | Missing foundation |
|----------|----------------|-------------------|
| Use logs/repairs/overrides in slice 1 | Map existing entities toward task shape in APIs | **Task** model; task inbox; assignment notifications |

---

## Log

### Current

- Full pipeline: `LogTemplate`, `LogTemplateField`, `LogAssignment`, `LogSubmission`, `LogSubmissionValue`.
- Field types: temp, pass/fail, yes/no, number, text, dropdown.
- Status: COMPLETED, FAILED, MISSED.
- Production-ready UI: builder, assign, submit, history.
- Department-scoped templates.

### Target

- **Compliance log** remains a specialized checklist attached to location + operation window.
- Instructions and attachments on template; corrective action on failure.
- Auto-missed detection and supervisor escalation.

### Verdict

| Preserve | Refactor later | Missing foundation |
|----------|----------------|-------------------|
| Entire log framework | Attachments UI; missed-log job | Background **missed log** detection; escalation tasks |

---

## Asset

### Current

- `Asset`: code, name, type, unit, department, vendor, status.
- `Vendor` registry on assets sub-tab.
- `PreventiveMaintenanceSchedule` linked to assets.
- Global unique `assetCode` (not facility-scoped).

### Target

- **Asset** at location with owning department; PM schedules; link to issues.
- QR/asset scan on floor (future).
- Facility-scoped identifiers in multi-tenant hosting.

### Verdict

| Preserve | Refactor later | Missing foundation |
|----------|----------------|-------------------|
| Asset + vendor + PM schema and UI | Scope asset/repair codes per site | Optional asset scan / mobile quick lookup |

---

## Supply item

### Current

- **Not modeled.** No inventory, PAR, or stock depletion.

### Target

- **SupplyItem** catalog per site (or org): napkins, trays, chemicals, disposables.
- PAR level per location or unit; **depletion capture** on floor.
- Shortage triggers **call-down** or issue.

### Verdict

| Preserve | Refactor later | Missing foundation |
|----------|----------------|-------------------|
| — | — | **SupplyItem**, **SupplyLevel** / PAR, depletion events, call-down linkage |

---

## Issue

### Current

- `Repair` work orders: corrective/preventive, priority, status, department routing, updates, attachments (partial UI).
- EVS quick ticket; dietary/plant `/repairs` page.
- Named "repair" in UI and schema.

### Target

- **Issue** generalizes: equipment, plumbing, supply shortage, safety, housekeeping.
- Same lifecycle: open → in progress → waiting → closed.
- Routed by department and location; visible on operational boards.

### Verdict

| Preserve | Refactor later | Missing foundation |
|----------|----------------|-------------------|
| Repair workflow end-to-end | Rename Repair → Issue in domain layer over time; add issue **type** dimension | Supply-shortage issue type; issue board on dietary dashboard |

---

## User / role / scope

### Current

- `User` (email) + `Employee` (PIN); `RoleKey` hierarchy; `AppRoute` permission matrix.
- Scopes: `facilityId`, optional `activeUnitId`, `primaryDepartmentId`, `ltc_active_department` cookie.
- `EmployeeUnitAccess` restricts PIN locations.
- FA, GM, Manager, Supervisor, Lead, Staff tiers.

### Target

- **Principal** = user or floor identity with **capabilities** constrained by:
  - Role (what actions)
  - Location (what places)
  - Operational mode (what modules)
  - Site (what campus) — later org
- Industry-neutral role labels in UI; same enforcement machinery.

### Verdict

| Preserve | Refactor later | Missing foundation |
|----------|----------------|-------------------|
| Dual auth, JWT shape, route matrix, unit/dept scoping | Neutral role display names; reduce hardcoded dept keys | Org-level principal; cross-site role assignments |

---

## Cross-cutting gaps

| Area | Current | Target | Category |
|------|---------|--------|----------|
| Call-downs | `AssignmentOverride` only for planned schedule | Real-time **coverage requests** and acknowledgments | Missing foundation |
| Notifications | None | In-app (+ optional push/email) for call-downs, issues, missed logs | Missing foundation |
| Supplies | None | PAR + depletion | Missing foundation |
| Messaging | None | Annotations on tasks/issues, not chat app | Missing foundation |
| Industry packs | LTC enums (CHRC, isolation room status) | Vertical presets, neutral core | Refactor later |
| Background jobs | None | Missed logs, reminders, exports | Missing foundation |
| File storage | Local disk | Shared object storage | Refactor later |

---

## Recommended sequencing (planning only)

1. **Preserve and package** existing dietary flows into **Dietary Operational Mode** ([FIRST_PRODUCT_SLICE.md](./FIRST_PRODUCT_SLICE.md)).
2. **Add missing foundation** for slice: call-downs (thin task model), supply items (minimal), readiness aggregation on dashboard.
3. **Refactor later**: organization entity, Issue rename, data-driven department nav, industry-neutral copy.
4. **Do not** restart repo or replace unit/log anchors (ADL-001, ADL-002, ADL-007).

---

## References

- [03-database-assessment.md](../architecture-review/03-database-assessment.md)
- [04-existing-features.md](../architecture-review/04-existing-features.md)
- [07-architecture-assessment.md](../architecture-review/07-architecture-assessment.md)
- [DOMAIN_MODEL_TARGET.md](./DOMAIN_MODEL_TARGET.md)
- [ARCHITECTURE_DECISION_LOG.md](./ARCHITECTURE_DECISION_LOG.md)
