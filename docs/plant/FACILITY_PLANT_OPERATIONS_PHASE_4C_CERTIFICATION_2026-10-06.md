# Facility Plant Operations — Phase 4C Certification

**Date:** 2026-10-06  
**Mode:** ACT complete — Preventive Maintenance Build / configuration UX  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Architecture addendum:** [Phase 4 architecture 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_4_ARCHITECTURE_2026-10-06.md)  
**Phase 4A:** [Phase 4A certification 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_4A_CERTIFICATION_2026-10-06.md)  
**Phase 4B:** [Phase 4B certification 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_4B_CERTIFICATION_2026-10-06.md)  
**Phase 3D:** [Phase 3D certification 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_3D_CERTIFICATION_2026-10-06.md)

Facility Plant Operations remains **DEVELOPMENT**. This phase did not implement PM Run/dashboard UX, PM analytics, starter PM content, Marketplace/billing/entitlement changes, or registry AVAILABLE.

---

## Verdict

```text
PASS — READY FOR PHASE 4D
```

Authorized Facility Plant Operations users can configure, publish, version, and retire deterministic Preventive Maintenance Plans. Publishing does not materialize occurrences or Work Orders. The Phase 4B generator remains the only materialization authority.

---

## Build location

Department Builder → Facility Plant Operations → **Maintenance**.

| Surface | Path |
|---|---|
| Plan list | `/build/departments/[departmentId]/preventive-maintenance` |
| Create | `/build/departments/[departmentId]/preventive-maintenance/new` |
| Editor / history | `/build/departments/[departmentId]/preventive-maintenance/[planId]` |

`?tab=maintenance` on the Plant Department Builder workspace redirects to the nested list. The Maintenance tab is Plant-only (`maintenanceEnabled` when department key is `PLANT` and Asset Operations is enabled). Nested PREFIX is SUPERVISOR+ and outranks `/build/departments` Manager+.

Not Asset Builder, Facility Builder, shared Work Builder, or Records Builder. Plans reference shared Assets, Procedures, Record templates, and People.

Internal Plant gate is `PLANT_OPERATIONS_ENABLED` via `loadPlantPmBuilderDepartment`. Customer Marketplace entitlement is not used.

---

## Plan list

Fields: name, Asset (name + code), Product status, current published version, cadence summary, next **projected** scheduled date, maintenance category, priority, Procedure, default technician.

Status presentation:

| State | Label |
|---|---|
| Plan `DRAFT` | Draft |
| Plan `PUBLISHED` | Published |
| Plan `PUBLISHED` + successor `DRAFT` | Published · Draft changes |
| Plan `RETIRED` | Retired |

Next projected date uses Phase 4A `projectPmSchedule` / `nextProjectedScheduledDate`. `nextDueAt` is not used.

Filters: All, Published, Draft, Retired, plus Asset name/code search. No analytics filters.

Asset RETIRED while Plan remains PUBLISHED shows **Generation paused — Asset is retired**. Plan status is not rewritten to Retired.

---

## Editor

Create writes a stable Plan + Version 1 DRAFT. No occurrence. No Work Order.

### Identity

Required name and Facility Asset selector (name, code, Location, operating condition). Asset identity is not copied into PM rows. Retired Assets cannot be chosen for new publication. A draft that later references a retired Asset shows a configuration warning; the Plan is not silently rewritten. Asset change is allowed only while the Plan itself is still `DRAFT`.

### Schedule

UI presets map to `intervalMonths` only: Monthly 1, Quarterly 3, Semiannual 6, Annual 12, Custom N. No Weekly. No cadence enum.

Copy:

- Schedule starts / Repeats / **Projected schedule**
- Scheduled dates stay fixed even if maintenance is completed late
- Create Work Order this many days before scheduled date (default 7, `>= 0`)
- Successor: **Changes take effect** [date]; already generated preventive Work Orders will not change

Effective date for first publish cannot be in the past. Successor effective date defaults with `defaultSuccessorEffectiveDate`.

Preview calls `previewDraftProjectedSchedule` → `projectPmSchedule`. No occurrence rows are written for preview.

Examples certified:

- Quarterly from 2027-01-15 → Jan 15, Apr 15, Jul 15, Oct 15
- Monthly from 2027-01-31 → Jan 31, Feb 28, Mar 31, Apr 30
- Leap February 2028-01-31 monthly → Feb 29

### Work Order defaults

Required maintenance category (canonical Facility categories; archived excluded for new publish). Priority Routine / High / Urgent (Routine persists `MEDIUM`; Emergency cannot publish). Optional default technician with copy that generation falls back to unassigned. Optional Procedure pins the published SOP version (`title vN`); later Procedure publishes do not move the pin.

### Required evidence

`PreventiveMaintenancePlanRecordRequirement` pins published Operational Template id + version. Successor may choose a newer template. No auto-upgrade. Creation order is MVP ordering.

Incomplete drafts are allowed. Publish surfaces Phase 4A service errors (missing Asset/category, invalid schedule, retired Asset, archived category, invalid Procedure/template, Emergency priority).

---

## Publish / successor / retire

Server actions wrap Phase 4A services only. They do not call `generatePmForFacility` or `createPreventiveWorkOrderForOccurrence`.

| Action | Result |
|---|---|
| First publish | Version 1 PUBLISHED; Plan PUBLISHED |
| Edit Plan | Successor DRAFT (`createPmPlanSuccessorDraft`) |
| Publish successor | New version PUBLISHED; prior SUPERSEDED; Plan stays PUBLISHED; existing occurrences keep `planVersionId` |
| Retire | Plan RETIRED after confirmation; versions and occurrences preserved |

Version history is read-only: version number, status, effective date, published date, cadence, Procedure. SUPERSEDED is historical, not deleted.

---

## Authorization

Existing PM / Department Builder helpers. Quick PIN never builds.

| Role | Draft | Publish / successor publish | Retire |
|---|---|---|---|
| Supervisor (password) | Yes | No | No |
| Manager+ (password) | Yes | Yes | Yes |
| Facility Administrator | Only if primary department is this Plant department | Same as Manager+ when that condition holds | Same |

Route registry: SUPERVISOR+ PREFIX on the nested builder. Mutations go through server actions.

---

## Browser certification

Authenticated facility password session (`plant.manager@ltc.local`) on isolated `next start` against disposable `ltc_verify_phase4c_browser_20261006`. Seed still fails on dropped `Unit.facilityId_name` unique; `plant-browser-fixtures` bootstrap Terrace View.

Playwright `@phase-4c` (`tests/plant-browser/phase-4c-pm-builder.spec.ts`) **PASS** — 5.5s.

Flow:

1. Open PM Build list
2. Create Plan, choose Asset
3. Monthly Jan 31 preview: Jan 31, Feb 28, Mar 31, Apr 30 2027
4. Quarterly Jan 15 preview: Jan 15, Apr 15, Jul 15, Oct 15 2027
5. Category, Routine, Procedure, required Record, default technician
6. Save draft — 0 occurrences, 0 PREVENTIVE Work Orders
7. Publish — still 0 occurrences
8. Edit Plan → successor banner
9. Annual cadence, effective 2027-07-01, successor Procedure
10. Publish successor — v1 Superseded, v2 Published, v1 `intervalMonths` remains 3
11. Retire — Plan `RETIRED`, version history remains

Generator was not invoked from the UI. Cron was not invoked in this browser run.

Production `next build` required `NODE_OPTIONS=--max-old-space-size=8192` on this machine. Cron helper `handlePlantPmCron` was moved out of the App Router `route.ts` so Next.js typecheck accepts only `GET`.

---

## Tests

Hermetic (`phase-4c-builder.hermetic.test.ts`, `phase-4a-domain.hermetic.test.ts`, `schedule.hermetic.test.ts`, `phase-4b-generator.hermetic.test.ts`, closeout, Product eligibility, Department Builder nav/auth): PASS.

SQL on disposable `ltc_verify_phase4c_sql_20261006` (`DATABASE_URL` pointed at the disposable DB so Asset Operations authority resolves against the same client):

| Suite | Result |
|---|---|
| Phase 4C SQL (`phase-4c-preventive-maintenance.test.ts`) | PASS — invalid publish blocked; first publish; Procedure/template pins; successor publish; occurrence freeze on v1; Asset RETIRED pauses generation without retiring Plan; reactivation restores eligibility; retire preserves history and stops new occurrences |
| Phase 4A SQL | PASS |
| Phase 4B SQL + concurrent generator | PASS |
| Phase 3D closeout SQL | PASS |

Did not target `ltc_manager`.

Static: `tsc --noEmit` exit 0; `prisma validate` ok; `verify:migrations` PASS — 120 migrations, newest `20261006140000_pm_active_work_order_unique`; targeted eslint on 4C paths clean; test-discovery sentinel PASS (351 files, 4C SQL in `SQL_BACKED_TEST_FILES`).

---

## Schema / migration

**No Phase 4C schema change. No Phase 4C migration.** Persistence is the Phase 4A/4B domain.

---

## Product governance

`getDepartmentProduct("PLANT")?.status === "DEVELOPMENT"`. Not Marketplace-visible, not sellable, not customer-installable. No billing/entitlement changes.

---

## Deferred to Phase 4D

Not implemented:

- PM Run dashboard
- Due / overdue operational views
- Technician preventive queue
- Manager PM exception surfaces
- PM-specific Work Order presentation polish
- Final PM scenarios 1–12 browser certification
- Generator “ensure now” from Build
- Occurrence admin table
- Starter PM content
- Registry AVAILABLE

---

## Phase 4D gate

```text
READY FOR PHASE 4D
```

An authorized Facility Plant Operations manager can now safely configure, publish, version, and retire deterministic Preventive Maintenance Plans without bypassing the canonical PM generator.
