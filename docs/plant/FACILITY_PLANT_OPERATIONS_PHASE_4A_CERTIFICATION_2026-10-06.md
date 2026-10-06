# Facility Plant Operations — Phase 4A Certification

**Date:** 2026-10-06  
**Mode:** ACT complete — Preventive Maintenance domain, schedule, and versioning  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Architecture addendum:** [Phase 4 architecture 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_4_ARCHITECTURE_2026-10-06.md)  
**Phase 3D:** [Phase 3D certification 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_3D_CERTIFICATION_2026-10-06.md)

Facility Plant Operations remains **DEVELOPMENT**. This phase did not implement occurrence generation, cron, Preventive Work Order generation, PM Build/Run UX, starter content, Marketplace/billing/entitlement changes, or registry AVAILABLE.

---

## Verdict

```text
PASS — READY FOR PHASE 4B
```

The PM domain is deterministic and historically stable enough to implement occurrence materialization and `PREVENTIVE` Work Order generation.

---

## Domain

```text
PreventiveMaintenancePlan                    stable identity (one Asset)
  └── PreventiveMaintenancePlanVersion       immutable published configuration
        ├── PreventiveMaintenancePlanRecordRequirement[]
        └── PreventiveMaintenanceOccurrence[]   durable obligation; frozen planVersionId
```

Execution remains future `Repair` (Work Order, kind `PREVENTIVE`) via `Repair.pmOccurrenceId`. No `PreventiveWorkOrder`, PM checklist, or PM history ledger.

Plan status: `DRAFT | PUBLISHED | RETIRED`.  
Version status: `DRAFT | PUBLISHED | SUPERSEDED` (no RETIRED on Version).  
Occurrence status (stored): `OPEN | COMPLETED | SKIPPED`.  
Projected while OPEN: `UPCOMING | DUE | OVERDUE` from Facility civil today vs `scheduledDate`.

---

## Schedule

Canonical primitive: `intervalMonths` (≥ 1) + facility-local `anchorDate` (`@db.Date`).

- Monthly 1, quarterly 3, semiannual 6, annual 12.
- No weekly canonical PM. Legacy `PreventiveMaintenanceCadence.WEEKLY` remains legacy.
- Month-end clamps to the last civil day of the target month from the original anchor day (Jan 31 monthly → Feb 28/29, Mar 31, Apr 30). Leap Feb 29 annual → Feb 28 in non-leap years.
- Completion is not an input. Late April work does not move July.
- Due dates are Facility civil dates via existing IANA helpers. DST does not shift the scheduled date.
- No Operational Cycles. No due window. `generationLeadDays` default 7; materialization date = `scheduledDate - lead`.
- `projectPmSchedule` returns projected dates. Those are not occurrence rows.

---

## Versioning

Knowledge-style successor drafts. Published and SUPERSEDED rows are immutable.

- First publish: Plan and Version become PUBLISHED. `effectiveDate` defaults to Facility today and cannot be earlier.
- Successor publish: previous PUBLISHED → SUPERSEDED (still historically authoritative inside its effective window). `effectiveDate >= facility today` and `effectiveDate > prior effectiveDate`.
- SUPERSEDED is not “ignore this version.” Example: v1 effective Jan 1 SUPERSEDED, v2 effective Jul 1 PUBLISHED → Apr uses v1, Jul+ uses v2.
- DRAFT is never schedule authority.
- Manager+ publish/retire. Supervisor and Quick PIN cannot Build-publish.
- EMERGENCY priority cannot publish. Stored default is `MEDIUM` (Product Routine).

---

## Occurrence freeze

Unique `(planId, scheduledDate)` is the obligation identity.

`occurrence.planVersionId` is the single governing version relation. Once the row exists it does not change, even if a successor is published before Work Order generation.

Projected dates after a successor effective boundary follow the successor cadence. Stale unmaterialized v1 dates are not preserved.

Phase 4A does not run a materializing generator. SQL tests insert an occurrence to prove freeze + uniqueness.

---

## Asset lifecycle vs Plan lifecycle

```text
Asset RETIRED  ≠  PM Plan RETIRED
```

- Asset RETIRED → generation ineligible; Plan status unchanged.
- OUT_OF_SERVICE → generation remains eligible.
- Asset returns to active lifecycle + Plan still PUBLISHED → generation eligible again.
- Plan RETIRED is explicit Builder action. Versions, occurrences, and Work Orders are not deleted. Open occurrences are not auto-skipped.

---

## Legacy PM

| Surface | Classification | 4A treatment |
|---|---|---|
| `PreventiveMaintenanceSchedule` + `nextDueAt` | SUPERSEDE | Readable. Not generated from. Not migrated. |
| `PreventiveMaintenanceCadence` | SUPERSEDE | Canonical cadence is `intervalMonths`. |
| `Repair.preventiveScheduleId` | COMPATIBILITY | Unchanged. |
| `WorkOrderKind.PREVENTIVE` | ADOPT | Existing kind. |

No automatic backfill from rolling `nextDueAt`.

---

## Migration

`prisma/migrations/20261006120000_preventive_maintenance_domain/migration.sql`

Additive: Plan, Version, RecordRequirement, Occurrence, enums, `Repair.pmOccurrenceId` (indexed, not unique).

**Active Work Order partial unique index is deferred to Phase 4B** so 4A does not add a constraint no generator yet exercises.

Applied to disposable `ltc_verify_phase3d_sql_20261006`. Did not target `ltc_manager`. Did not edit historical migrations.

---

## Tests

Hermetic (`schedule.hermetic.test.ts`, `phase-4a-domain.hermetic.test.ts`): 19 passed.

- Monthly / quarterly / semiannual / annual
- Month-end clamp without drift
- Leap-year annual clamp
- Late completion is not a schedule input; July stays July
- NY / UTC / DST civil-date stability
- SUPERSEDED still governs pre-successor dates
- Frozen occurrence beats later version selection
- Successor cadence drops stale unmaterialized v1 dates
- OPEN → UPCOMING / DUE / OVERDUE; COMPLETED / SKIPPED override
- Asset RETIRED ≠ Plan RETIRED
- Manager+ publish; Plant remains DEVELOPMENT
- No cron / Work Order generation in 4A services

SQL (`phase-4a-preventive-maintenance.test.ts`): 2 passed on disposable DB.

- Draft → publish → successor → supersede
- First-publish and successor effectiveDate guards
- Record template pin snapshots
- July occurrence remains v1 after v2 publish
- `(planId, scheduledDate)` uniqueness
- Multiple `Repair` rows on one occurrence
- Asset RETIRED does not mutate Plan status
- Plan retire keeps versions and occurrence
- Legacy `PreventiveMaintenanceSchedule` untouched

Static: eslint on `src/lib/preventive-maintenance` clean; `prisma validate` ok; test-discovery sentinel PASS (347 files, 37 SQL-backed suites).

---

## Product governance

`getDepartmentProduct("PLANT")?.status === "DEVELOPMENT"`. Not Marketplace-visible, not sellable, not customer-installable. No billing/entitlement changes.

---

## Deferred to Phase 4B

- Occurrence materialization generator
- Cron / scheduled route
- Preventive Work Order generation and snapshot
- Skip operational flow
- Replacement Work Order policy / concurrency
- Active-WO partial unique index
- Build UX / Run UX
- Starter PM content
- Product AVAILABLE
