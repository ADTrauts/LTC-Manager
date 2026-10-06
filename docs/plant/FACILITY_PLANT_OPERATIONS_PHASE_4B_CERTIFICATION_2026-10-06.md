# Facility Plant Operations — Phase 4B Certification

**Date:** 2026-10-06  
**Mode:** ACT complete — PM occurrence materialization + PREVENTIVE Work Order generation  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Architecture addendum:** [Phase 4 architecture 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_4_ARCHITECTURE_2026-10-06.md)  
**Phase 4A:** [Phase 4A certification 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_4A_CERTIFICATION_2026-10-06.md)  
**Phase 3D:** [Phase 3D certification 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_3D_CERTIFICATION_2026-10-06.md)

Facility Plant Operations remains **DEVELOPMENT**. This phase did not implement PM Build UX, PM Run/dashboard UX, starter PM content, meter-based PM, Marketplace/billing/entitlement changes, or registry AVAILABLE.

---

## Verdict

```text
PASS — READY FOR PHASE 4C
```

PM generation is deterministic, idempotent, concurrency-safe, timezone-safe, and catch-up capable enough to expose through Build configuration UX.

---

## Materialization

A durable `PreventiveMaintenanceOccurrence` is created only when:

```text
facilityToday >= scheduledDate - generationLeadDays
```

for the governing historically published Plan Version (`PUBLISHED` or `SUPERSEDED` in its effective window).

`projectEligiblePmMaterializationDates` uses centralized Phase 4A schedule functions:

1. Resolve Facility civil today from the Facility IANA timezone (not UTC date).
2. Project cadence from the first version `effectiveDate` through `facilityToday + max(generationLeadDays)`.
3. Keep dates whose version-specific materialization date is `<= facilityToday`.
4. Ignore dates before the first effective schedule. Do not invent pre-publication history.
5. Insert missing `(planId, scheduledDate)` rows with frozen `planVersionId`.
6. Unique conflicts (`P2002`) reload the existing row.

Catch-up: if the generator misses the lead date (scheduled Oct 15, lead 7, first run Oct 11), the Oct 15 occurrence still materializes. Past scheduled dates materialize as `OPEN` and present as `OVERDUE`. Future dates remain projected only.

Prior OPEN/OVERDUE obligations do not block later periods. Late completion does not shift cadence.

Eligible Plans: `status = PUBLISHED` and Asset lifecycle is not `RETIRED`. `DEGRADED` and `OUT_OF_SERVICE` remain eligible. Retired Plans are not loaded; existing OPEN occurrences are not auto-skipped or deleted.

---

## Work Order generation

Internal `createPreventiveWorkOrderForOccurrence` — no session, no fake employee.

| Snapshot | Source |
|---|---|
| Kind | `workOrderKind = PREVENTIVE` on canonical `Repair` |
| Occurrence | `Repair.pmOccurrenceId` (authoritative). Legacy `preventiveScheduleId` unused |
| Title | Plan Version `name` |
| Description | Plan Version `instructions`, else `Preventive Maintenance` / `Scheduled {Mon D, YYYY}` |
| Location | Current Asset unit/space via `snapshotWorkOrderLocation` |
| Category | Frozen Plan Version category; must still exist on Facility and be unarchived |
| Priority | Frozen Plan Version priority (LOW/MEDIUM present as ROUTINE) |
| Procedure | Frozen `procedureVersionId` (`PUBLISHED` or `SUPERSEDED`). No silent upgrade |
| Requirements | Each Plan Version Record requirement → `RepairRecordRequirement` in the same transaction |
| Assignment | Default employee if still ACTIVE Facility/Plant member; else Unassigned |
| Vendor | None |
| Issue | None (`issueId` null). PM is an obligation, not an undesirable condition |
| Created-by | `reportedById` / update actor / requirement `createdByUserId` are null (system) |
| Dates | `dueAt` / `targetDate` copy civil midnight as a projection only. Canonical date is `occurrence.scheduledDate` |

Departments: Plan `departmentId` is requesting and responsible. `suggestRepairDepartmentIds` is not used (cron has no session).

Invalid configuration (archived category, missing Procedure, missing template) records a generator exception and continues other Plans. The occurrence stays `OPEN` with no Work Order.

---

## Idempotency and concurrency

Occurrence identity: unique `(planId, scheduledDate)`.

Active Work Order: partial unique index `Repair_pmOccurrenceId_active_key`:

```sql
CREATE UNIQUE INDEX "Repair_pmOccurrenceId_active_key"
ON "Repair" ("pmOccurrenceId")
WHERE "pmOccurrenceId" IS NOT NULL
  AND "status" NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED');
```

`pmOccurrenceId` is not globally unique. Historical canceled/completed Work Orders may share an occurrence. At most one active Work Order.

Two concurrent generator workers: unique violations are treated as idempotent reloads, not batch failure. SQL test used two Prisma clients against the same disposable database.

---

## Cancellation, skip, completion

**Cancel.** Does not complete, skip, or move the occurrence. Occurrence stays `OPEN`. Next run creates a replacement Work Order with fresh requirements from the frozen Plan Version.

**Skip.** Supervisor+ (`canSkip`). Reason required (≥ 8 characters, same floor as Record waiver). Refused when an active Work Order exists. Sets `SKIPPED` / `skippedAt` / `skippedByUserId` / `skipReason`. Cadence unchanged. Generator never creates a Work Order for a skipped occurrence. No reopen in 4B.

**Complete.** Phase 3D `completeWorkOrder` → `applyWorkOrderCloseoutCompletion` in the same transaction marks the occurrence `COMPLETED` with `completedAt` and `completedWorkOrderId` when the Work Order is `PREVENTIVE` and linked. Required Records and labor gates are unchanged. Completing a PM Work Order does not resolve a discovered Issue.

---

## Cron

`GET /api/internal/plant/preventive-maintenance`

- `Authorization: Bearer CRON_SECRET` (timing-safe compare; independent of support automation)
- Unconfigured secret → 503; invalid → 401
- Thin: authenticate → `runPmGeneration` → structured JSON
- Vercel Cron: `0 6 * * *` UTC
- Iterates Facilities that have published PM Plans; each Facility uses its IANA timezone for civil today
- One failing Plan or Facility does not abort the batch
- Result: `facilitiesProcessed`, `plansProcessed`, `occurrencesCreated`, `workOrdersCreated`, `skippedIneligible`, `configurationErrors`

---

## Migration

`prisma/migrations/20261006140000_pm_active_work_order_unique/migration.sql`

Before the unique index, extra active Work Orders per occurrence (Phase 4A SQL fixtures) are collapsed to `CANCELLED` so apply is deterministic. Production 4A data had no generated PM Work Orders.

Phase 4A migration was not edited. Applied to disposable `ltc_verify_phase4b_sql_20261006` (template of `ltc_verify_phase3d_sql_20261006`). Did not target `ltc_manager`.

---

## Tests

Hermetic (`phase-4b-generator.hermetic.test.ts`, `schedule.hermetic.test.ts`, `phase-4a-domain.hermetic.test.ts`): PASS.

- Catch-up lead window; overdue still eligible
- Eligible dates skip pre-effective history
- v1/v2 selection; freeze is a persistence invariant
- Skip is Supervisor+, not Build publish
- Cron Bearer compare; generator/cron have no fake session
- Work Order copy mapping; PM read projection
- Plant remains DEVELOPMENT

SQL (`phase-4b-preventive-maintenance.test.ts`): 4 passed on disposable `ltc_verify_phase4b_sql_20261006`.

- A: run/run/run → one occurrence, one active Work Order
- B: two Prisma clients concurrent → one occurrence, one active Work Order
- C: requirements instantiated once per generated Work Order
- D: Procedure pin survives SUPERSEDED successor
- E: cancel → occurrence OPEN → replacement WO #2
- F: Phase 3D closeout completes occurrence
- G/H: skip without active WO; skip refused with active WO
- I: archived category fails that Plan only
- J: terminated default assignee → Unassigned WO
- K: Asset move snapshots new Location on future occurrence; past WO stays
- Catch-up Jan 11 for Jan 15; April while January complete; July while April overdue; skip July does not block October
- OOS generates; RETIRED Asset suppresses generation without retiring Plan
- Cron 503/401/200; Auckland vs New York civil dates at the same UTC instant

Phase 3D regression (`phase-3d-work-order-closeout.test.ts`): PASS on the same disposable DB. Phase 4A SQL: PASS (two historical Work Orders now CANCELLED + OPEN to match the active-WO index).

Issue: PM required Record created an Issue via `createIssueFromRecord`; completing the PM Work Order left the Issue unresolved.

Static: `tsc --noEmit` exit 0; `prisma validate` ok; eslint on 4B paths clean; test-discovery sentinel PASS (349 files, 38 SQL-backed suites). `verify:migrations` fails until the new migration directory is git-tracked; expected before the Phase 4B commit.

---

## Product governance

`getDepartmentProduct("PLANT")?.status === "DEVELOPMENT"`. Not Marketplace-visible, not sellable, not customer-installable. No billing/entitlement changes.

---

## Deferred to Phase 4C / 4D

### 4C
- PM Plan list / editor
- Publish / successor / retire UI
- Record requirement editor UI

### 4D
- PM Run dashboard
- Due / overdue views
- Manager PM operations UX
- Full browser acceptance scenarios

Generated PREVENTIVE Work Orders remain readable through existing Work Order load/list (`preventive` context: plan name, scheduled date, occurrence id). No PM-specific visual design.
