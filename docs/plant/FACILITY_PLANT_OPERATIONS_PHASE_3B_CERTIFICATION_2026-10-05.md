# Facility Plant Operations — Phase 3B Certification

**Date:** 2026-10-05  
**Mode:** ACT complete — canonical Work Order domain foundation  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Plan:** [Phase 3 Plan 2026-10-05](./FACILITY_PLANT_OPERATIONS_PHASE_3_PLAN_2026-10-05.md)  
**Phase 3A:** [Phase 3A certification 2026-10-05](./FACILITY_PLANT_OPERATIONS_PHASE_3A_CERTIFICATION_2026-10-05.md)

Facility Plant Operations remains **DEVELOPMENT**. This phase did not implement 3C operating UX, 3D closeout/cost/required Records, PM, billing, or registry AVAILABLE.

---

## Verdict

```text
PASS — READY FOR PHASE 3C
```

`Repair` is now a stable Work Order foundation: occurrence Room, Procedure version pin, canonical status/priority projection, hold reason, Facility maintenance categories, and incidental Record links. Completing a Work Order still does not resolve Issue, close Request, or restore Asset.

---

## Persistence / domain boundary

```text
Persistence = Repair
Product noun = Work Order
```

No `WorkOrder` table. No `@@map`. New domain APIs (`createWorkOrder`, `loadWorkOrder`, `presentWorkOrderStatus`, `holdWorkOrder`, `linkEvidenceToWorkOrder`) sit on the existing Repair service. Legacy create/update names remain as compatibility wrappers.

---

## Schema result

| Object | Result |
|--------|--------|
| `Repair.spaceId` | optional FK → `UnitSpace`, `ON DELETE SET NULL`. Historical rows stay null. |
| `Repair.procedureVersionId` | optional FK → `KnowledgeArticleVersion`, `ON DELETE RESTRICT` |
| `Repair.holdReason` | optional `WorkOrderHoldReason` |
| `Repair.maintenanceCategoryId` | optional FK → `MaintenanceCategory`, `ON DELETE RESTRICT` |
| `RepairStatus.ON_HOLD` | already existed — no enum add |
| `RepairPriority.EMERGENCY` | additive |
| `MaintenanceCategory` | Facility-scoped `key` + `label` + `sortOrder` + `archivedAt` |
| `RepairEvidenceLink` | incidental Record link; unique `(repairId, evidenceRecordId)` |

`assignedEmployeeId` and `vendorId` unchanged. `workOrderKind` remains `CORRECTIVE | PREVENTIVE`. No `sourceType` enum.

---

## Location

New Work Orders snapshot `unitId` / optional `spaceId` at create.

- Asset-backed: explicit Location wins; otherwise Asset current Location is copied once.
- From Issue: Issue snapshot Location is the default.
- Location-only: Asset may be null; Unit required; Space optional.
- Later Asset moves do not rewrite Work Order Location.
- Historical Repairs remain `spaceId = null`. No fabricated room backfill.

---

## Procedure

Active pins must be:

- same Facility;
- Knowledge category `SOP` (`isKnowledgeProcedureCategory`);
- version status `PUBLISHED`.

DRAFT / SUPERSEDED pins are rejected for new writes. After v2 publishes, an existing WO that pinned v1 still references v1. No latest-head lookup.

---

## Status mapping

Stored `RepairStatus` is not rewritten.

| Stored | Canonical | Hold reason |
|--------|-----------|-------------|
| OPEN | OPEN | — |
| ASSIGNED | ASSIGNED | — |
| IN_PROGRESS | IN_PROGRESS | — |
| ON_HOLD | ON_HOLD | stored reason, else OTHER |
| WAITING_PARTS | ON_HOLD | WAITING_FOR_PART (inferred if `holdReason` null) |
| WAITING_ON_VENDOR | ON_HOLD | WAITING_FOR_VENDOR |
| COMPLETED | COMPLETED | — |
| CLOSED | COMPLETED | — |
| CANCELLED | CANCELED | — |

New hold writes persist `ON_HOLD` + `WorkOrderHoldReason`. Technician `WAITING_*` actions normalize the same way. Leaving hold clears `holdReason`. Legacy WAITING_* rows remain stored.

Hold reasons: `WAITING_FOR_PART`, `WAITING_FOR_VENDOR`, `WAITING_FOR_ACCESS`, `SCHEDULED_LATER`, `OTHER`.

---

## Priority mapping

| Stored | Canonical |
|--------|-----------|
| LOW | ROUTINE |
| MEDIUM | ROUTINE |
| HIGH | HIGH |
| URGENT | URGENT |
| EMERGENCY | EMERGENCY |

LOW/MEDIUM rows are not rewritten. Legacy Task mapping sends `EMERGENCY` → Task `URGENT`.

---

## Maintenance category

Schema: `MaintenanceCategory` unique `(facilityId, key)`. Soft archive via `archivedAt`. Historical Work Orders may keep an archived category.

Defaults (idempotent `ensureDefaultMaintenanceCategories`):

```text
HVAC
PLUMBING
ELECTRICAL
LIFE_SAFETY
KITCHEN_EQUIPMENT
CARPENTRY_BUILDING
GROUNDS
GENERAL_REPAIR
```

Facility isolation is enforced. Cross-facility category IDs are rejected.

No historical category backfill. Projection maps `RepairTrade` when `maintenanceCategoryId` is null:

| RepairTrade | Category key |
|-------------|--------------|
| PLUMBING | PLUMBING |
| ELECTRICAL | ELECTRICAL |
| EQUIPMENT | GENERAL_REPAIR |
| GENERAL | GENERAL_REPAIR |

EQUIPMENT is not guessed as kitchen.

---

## Records

Incidental `RepairEvidenceLink` implemented, matching Request/Issue link tables.

- Same-Facility canonical `OperationalEvidenceRecord` only.
- Cross-Facility rejected.
- No `WorkOrderRecordRequirement`.
- `AssetIssue.originEvidenceRecordId` deferred to 3C (not needed for 3B structure).
- No Plant inspection/log engine.

---

## History

Asset History uses Work Order copy and may show Procedure version / category when stored.

Location History uses stored Repair `unitId` / `spaceId`. Space-filtered history includes new room-accurate WOs and omits old null-space WOs. Live Asset Location is never used.

---

## Routes

`/repairs` kept. Queue aria/sr-only copy says Work Order. Maintenance sub-tab remains **Repairs** per platform nav contract. `/issues` stays compatibility. `/asset-issues` still lists authoritative `Repair.issueId` Work Orders from 3A.

---

## Migration

**Filename:** `prisma/migrations/20261005220000_work_order_domain_foundation/migration.sql`

Additive only. No `spaceId` / procedure / hold / priority / trade rewrite. Applied as migration 116 on disposable `ltc_verify_phase3b_plant_20261005`. Source `ltc_manager` was never targeted.

Pre-3B shaped rows survive: null space, stored WAITING_*, stored LOW/MEDIUM, readable `RepairTrade`, Issue/Request identities unchanged.

---

## Tests

Disposable SQL: `scripts/verify/admin-database.mjs` → `ltc_verify_phase3b_plant_20261005`.

Hermetic (targeted): Work Order semantics, Issue/Request/Location/Knowledge/Department Product — **pass**.

SQL isolated:

| Suite | Result |
|-------|--------|
| Phase 3B Work Order domain (2) | PASS |
| Phase 3A Issue generalization (2) | PASS |
| Phase 10A (4) | PASS |
| Phase 12A Request (2) | PASS |
| Phase 12A Plant (2) | PASS |
| Location History (1) | PASS |
| Knowledge versions (1) | PASS |

```text
pnpm exec prisma validate     PASS
pnpm typecheck                PASS
targeted eslint               PASS
pnpm lint                     FAIL — 9 errors, 45 warnings — PRE-EXISTING
pnpm verify:migrations        PASS after staging — 116 migrations
                              newest 20261005220000_work_order_domain_foundation
```

No INTRODUCED failures remaining.

---

## Invariants

```text
WO complete ≠ Issue resolved
WO complete ≠ Request resolved
WO complete ≠ Asset recovery
```

---

## Product governance

`getDepartmentProduct("PLANT")?.status === "DEVELOPMENT"`. Not Marketplace-visible, not sellable, not customer-installable. No billing/entitlement changes.

---

## Deferred

### 3C

Complete Plant triage, manager corrective queue, technician execution UX, canonical transition UI, Request → Issue → WO orchestration UX.

### 3D

Labor duration, parts, costs, required Record enforcement, formal closeout gate.

Still no PM. Still not AVAILABLE.

---

## Phase 3C gate

```text
READY FOR PHASE 3C
```

The Work Order row now has the location, Procedure, status, hold, priority, category, assignment, Vendor, and incidental Record structure needed to build the real corrective-maintenance operating workflow without a second table.
