# Facility Plant Operations — Phase 4D Certification

**Date:** 2026-10-06  
**Mode:** ACT complete — Preventive Maintenance Run UX + end-to-end certification  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Architecture addendum:** [Phase 4 architecture 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_4_ARCHITECTURE_2026-10-06.md)  
**Phase 3D:** [Phase 3D certification 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_3D_CERTIFICATION_2026-10-06.md)  
**Phase 4A:** [Phase 4A certification 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_4A_CERTIFICATION_2026-10-06.md)  
**Phase 4B:** [Phase 4B certification 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_4B_CERTIFICATION_2026-10-06.md)  
**Phase 4C:** [Phase 4C certification 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_4C_CERTIFICATION_2026-10-06.md)

Facility Plant Operations remains **DEVELOPMENT**. This phase did not implement starter/default PM content, meter-based/IoT/predictive PM, inventory integration, advanced analytics, compliance scoring, Marketplace/billing/entitlement changes, or registry AVAILABLE.

---

## Verdict

```text
PASS — PREVENTIVE MAINTENANCE MVP COMPLETE
```

Authorized Facility Plant Operations users can operate published Preventive Maintenance through the existing Work Order execution engine. Managers/Supervisors have an exception-first Run board. Technicians execute PREVENTIVE Work Orders in the same My Work / Work Order detail / Phase 3D closeout path as corrective work.

---

## Run navigation

Chosen route: **`/preventive-maintenance`** (PREFIX, SUPERVISOR+).

Not Build (`/build/departments/[departmentId]/preventive-maintenance`). Persistence names are not exposed.

Placement: RUN **Maintenance** sub-nav (supervisor composition):

```text
Assets · Repairs · Preventive · Vendors
```

STAFF do not receive Maintenance sub-tabs. STAFF land on `/repairs` My Work. Route registry denies STAFF on `/preventive-maintenance`; the page also redirects SUPERVISOR floor misses to `/repairs`.

Product mode: RUN · Maintenance.

---

## PM operational grouping

Exception-first attention view, Facility civil today (server/domain, not browser local):

| Section | Rule | Sort |
|---|---|---|
| Overdue | OPEN occurrence, Facility today > scheduledDate | oldest scheduled first |
| Due today | OPEN, today === scheduledDate | priority, then date/name |
| Unassigned | OPEN with active Work Order and no assignee | priority, then date |
| Due soon | OPEN, upcoming, inside generation lead window | scheduled date ascending |
| Needs configuration | OPEN, in window, no Work Order at all | scheduled date |

Secondary views (not the operational lead):

- **Completed** — occurrence completed only through PREVENTIVE Work Order closeout
- **Skipped** — explicit skip, never shown as completed
- **Projected** — `projectPmSchedule` dates with no occurrence row; labeled **Projected**; location is current Asset location preview only

A row may appear in more than one attention list (for example Overdue + Unassigned). Plan status, occurrence status, and Work Order status remain independent.

Canceled Work Orders are not treated as configuration failures. Historical canceled Work Orders stay visible; the active Work Order is prominent. After cancel, occurrence stays OPEN until generator replacement.

Empty states:

- No published Plans: “No Preventive Maintenance Plans are published.” + Configure a Plan when the viewer can draft
- Published Plans but nothing in attention: “No preventive maintenance needs attention right now.”
- Configuration failures are not reported as “nothing due”

Counts: overdue, due today, unassigned, due soon only. No compliance percentage, MTBF, MTTR, or charts.

---

## Technician integration

PREVENTIVE Work Orders appear in `/repairs` My Work with corrective assignments. There is no technician PM application.

Queue copy:

- Kind chip: **Preventive** / **Corrective**
- Source line: `Preventive Maintenance · {Plan} · Scheduled {date}`
- Filter tab: **Preventive**

Work Order detail shows a concise **Preventive Maintenance** card (`pm-work-order-context`): Plan, scheduled date, occurrence projection, Asset, pinned Procedure version, category, required evidence. Supervisor+ can open occurrence detail. Build controls are not inlined.

Required evidence and closeout are Phase 3D unchanged. Generated `RepairRecordRequirement` rows are indistinguishable from manually configured requirements.

---

## Skip

Supervisor+ (including Quick PIN) on occurrence detail when occurrence is OPEN.

- Reason required (`WAIVE_REASON_MIN_LENGTH` / 8 characters)
- Confirmation copy: this skips only this scheduled occurrence; future schedule dates will not change
- Active Work Order: Skip is blocked with **Cancel or complete the active Work Order first.**
- STAFF cannot skip
- Plan retire is not exposed here

---

## Configuration exceptions

Derived at load from generator-shaped facts. No new error table.

Examples: archived maintenance category, missing category, invalid/missing Procedure, missing Record template, otherwise “Work Order could not be generated.”

Configure Plan / View Plan links go to the Build editor for authorized users.

---

## Asset lifecycle / location

- Generated Work Order Location is the snapshot on the Repair
- Future projected rows preview current Asset Location and say so
- Asset RETIRED: no new generation; Plan stays PUBLISHED; **Asset retired** shown; historical rows remain
- Asset OUT_OF_SERVICE: still generates and executes; condition is visible
- Asset move: historical WO stays at snapshot Location; later WO uses new Location
- Retired Plan: historical occurrences remain; labeled **Plan retired**, distinct from Skipped

Manual Work Order assignment does not rewrite `defaultAssignedEmployeeId` on the Plan Version.

---

## Acceptance scenarios 1–12

| # | Scenario | Result | Proof |
|---|---|---|---|
| 1 | Quarterly fixed cadence; late completion does not shift later dates | PASS | 4B + 4D SQL: April stays April; July stays 2027-07-15 |
| 2 | Duplicate generation | PASS | 4B + 4D SQL: second/third generator run creates 0 occurrences / 0 Work Orders |
| 3 | Missed generator, run later | PASS | 4B + 4D SQL catch-up materialization |
| 4 | Overdue remains OPEN and actionable | PASS | SQL projection + browser Overdue section |
| 5 | Later occurrence while prior overdue | PASS | 4B + 4D SQL: April OPEN overdue, July still generates |
| 6 | Skip with reason; no later WO; cadence unchanged | PASS | SQL + browser skip flow |
| 7 | Canceled WO → occurrence OPEN → replacement WO; history both | PASS | 4B + 4D SQL |
| 8 | Procedure version pin | PASS | 4D SQL: Jan WO stays v1; Oct WO uses successor Procedure v2 |
| 9 | Required evidence blocks then allows Phase 3D complete | PASS | 4D SQL + browser closeout |
| 10 | Finding → Issue OPEN after PM complete | PASS | 4D SQL + browser `createIssueFromRecord` |
| 11 | Asset move: old WO Location A, new WO Location B | PASS | 4D SQL |
| 12 | Asset retired: no new generation; Plan stays PUBLISHED | PASS | 4B + 4D SQL |

---

## Browser certification

Authenticated facility password sessions on isolated `next start` against disposable `ltc_verify_phase4b_sql_20261006`. Seed still fails on dropped `Unit.facilityId_name` unique; `plant-browser-fixtures` bootstrap Terrace View. Production `next build` required `NODE_OPTIONS=--max-old-space-size=8192`.

Playwright `@phase-4d` (`tests/plant-browser/phase-4d-pm-run.spec.ts`) **PASS** — 2 passed (22.4s on skip-build rerun; full production build + typecheck succeeded).

1. **Primary end-to-end** — Manager overdue board (label, scheduled date, linked Work Order); STAFF denied the Run board; technician My Work shows corrective + preventive; PM context (plan, schedule, Procedure v1, required evidence); missing Record blocks complete; satisfy Record; Issue from Record; complete WO; occurrence COMPLETED; Issue not RESOLVED; completed view shows the Plan; completed occurrence leaves the attention board.
2. **Skip** — Supervisor sees blocked skip when an active Work Order exists; skip form requires a reason; skipped record appears; next projected quarterly date is unchanged.

Generator was invoked from the test process (`generatePmForFacility`), not from page load.

---

## SQL / hermetic / regression

Disposable DB: `ltc_verify_phase4b_sql_20261006` (never `ltc_manager`). `DATABASE_URL` pointed at the disposable DB so Work Order authority resolves against the same client. `PLANT_OPERATIONS_ENABLED=true`.

| Suite | Result |
|---|---|
| Phase 4D hermetic (`phase-4d-run.hermetic.test.ts`) | PASS |
| Phase 4D SQL (`phase-4d-preventive-maintenance.test.ts`) | PASS — grouping, timezone (America/Los_Angeles vs UTC instant), skip, config exception, assignment isolation, scenarios 1–12 |
| Phase 4A SQL | PASS |
| Phase 4B SQL + concurrent generator | PASS |
| Phase 4C SQL | PASS |
| Phase 3D closeout SQL | PASS |
| Phase 3C corrective SQL | PASS in isolation (parallel run with other SQL files can collide on count-based `repairCode`; pre-existing, not a 4D product defect) |
| 4A/4B/4C hermetic + route/nav/filter | PASS |
| Test-discovery sentinel | PASS — 353 files, 40 SQL-backed (includes 4D) |

Commands:

```text
node --import tsx --test src/lib/preventive-maintenance/phase-4d-run.hermetic.test.ts
PLANT_OPERATIONS_ENABLED=true node --import tsx --test src/lib/preventive-maintenance/phase-4d-preventive-maintenance.test.ts
PLANT_OPERATIONS_ENABLED=true node --import tsx --test src/lib/preventive-maintenance/phase-4a-preventive-maintenance.test.ts src/lib/preventive-maintenance/phase-4b-preventive-maintenance.test.ts src/lib/preventive-maintenance/phase-4c-preventive-maintenance.test.ts src/lib/asset-operations/phase-3d-work-order-closeout.test.ts
PLANT_OPERATIONS_ENABLED=true node --import tsx --test src/lib/asset-operations/phase-3c-corrective-maintenance.test.ts
PLANT_BROWSER_GREP=@phase-4d npm run test:plant-browser
```

Run UI does not call `generatePmForFacility`. No page-load generation.

---

## Schema / migration

```text
No schema change.
No migration.
```

The Phase 4A/4B model already represented Run needs. Configuration exceptions are derived. Calendar states are projections.

---

## Product governance

`getDepartmentProduct("PLANT")?.status === "DEVELOPMENT"`. Not Marketplace-visible, not sellable, not customer-installable. No billing/entitlement changes.

---

## Remaining PM deferrals

Not implemented (intentionally):

- Meter-based PM
- IoT
- Predictive
- Inventory integration
- Advanced analytics
- Compliance scoring / Compliant / Non-compliant language
- Starter/default PM content
- Product AVAILABLE
- Generator “ensure now” from Run page load

Known non-blocking tension (from 4C): Build may publish a Plan without a pinned Procedure; the 4B generator still requires a historically published Procedure and leaves the occurrence OPEN. Run surfaces that as **Needs configuration**.

---

## PM MVP gate

```text
PM MVP COMPLETE
```

Core PM architecture and execution for Facility Plant Operations V1 are in place: Plan → immutable Version → occurrence materialization → PREVENTIVE Work Order → My Work / detail / Phase 3D closeout, with manager exception Run, skip, replacement after cancel, finding → Issue, and Asset lifecycle/location snapshot rules. Remaining work is content, analytics, and Product release — not another PM execution engine.
