# Facility Plant Operations — Phase 3D Certification

**Date:** 2026-10-06  
**Mode:** ACT complete — Work Order closeout, evidence, labor, parts, and recorded material/vendor expense  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Phase 3C:** [Phase 3C certification 2026-10-05](./FACILITY_PLANT_OPERATIONS_PHASE_3C_CERTIFICATION_2026-10-05.md)

Facility Plant Operations remains **DEVELOPMENT**. This phase did not implement PM, inventory, payroll, purchasing/AP, Work Order reopen, Procedure architecture expansion, Marketplace/billing/entitlement changes, or registry AVAILABLE.

> Historical note: the “did not implement PM” statement was true at Phase 3D close. Preventive Maintenance was implemented and certified in Phase 4A–4D.

---

## Verdict

```text
PASS — CORRECTIVE MVP COMPLETE
```

A completed Work Order now answers what work was performed, how much labor was recorded, which parts were used, what material/vendor expense was recorded, which Records were required, whether those Records were completed or waived, whether Asset condition was reviewed, and whether the Work Order is complete enough to close.

Work Order completion still does not resolve Issue, close Request, or restore Asset unless the explicit Asset condition review says to change condition.

---

## Persistence / Product nouns

```text
Repair                      = Work Order
RepairLaborEntry            = Work Order Labor Entry
RepairPartUsed              = Work Order Part Used
RepairRecordRequirement     = Work Order Required Evidence
RepairEvidenceLink          = associated / incidental evidence
Repair.workPerformed        = authoritative closeout summary
Repair.resolution           = compatibility only
```

No `WorkOrderCloseout` table. No payroll, inventory, or AP tables.

---

## Labor

`RepairLaborEntry` stores integer `minutes >= 0`, attributed to `employeeId` (performer) with optional `recordedByUserId`.

- Missing labor entries are not the same as a zero-minute entry.
- Zero minutes is valid (vendor-only / coordination closeout).
- Reassigning the Work Order does not rewrite historical labor attribution.
- Technician STAFF may record/update own labor on an active assigned Work Order.
- After completion, technician cannot edit; Supervisor+ may correct with `RepairUpdate`.

Labor is not elapsed `startedAt → completedAt` and is not `estimatedLaborMinutes`.

---

## Parts and expense

`RepairPartUsed` stores required description, optional part number, quantity `Decimal(12,3) > 0`, optional line cost `Decimal(12,2) >= 0`. No catalog/inventory FK. Unit cost is derived as `lineCost / quantity` when displayed; it is not stored.

`Repair.externalCost` / `externalCostNote` plus existing `vendorId` support Vendor+cost, Vendor without cost, and cost without Vendor.

Canonical projection (null-safe Decimal; no labor dollars):

```text
recordedPartsCost              = sum(non-null RepairPartUsed.lineCost)
recordedExternalCost           = Repair.externalCost
recordedMaterialVendorExpense  = recordedPartsCost + recordedExternalCost
```

Product copy is **Recorded material & vendor expense**. Persistence does not hardcode a currency.

---

## Required evidence

`RepairRecordRequirement` pins published `OperationalTemplate` id, stable key, version, and name. Status: `PENDING` | `SATISFIED` | `WAIVED`.

- SATISFIED only when linked to a canonical `OperationalEvidenceRecord` with status `COMPLETED` or `COMPLETED_WITH_CORRECTIVE_ACTION`, matching template/version/Facility.
- `NEEDS_REVIEW` does not satisfy.
- `COMPLETED_WITH_CORRECTIVE_ACTION` / out-of-standard still satisfies the evidence requirement. It does not mean the Record passed, the Issue resolved, or the Asset recovered.
- Supervisor+ may waive with reason length ≥ 8. Waiver is a real outcome; no dummy Record.
- Technician STAFF cannot configure or waive requirements.
- `RepairEvidenceLink` remains incidental associated evidence and is distinct from required evidence.

---

## Completion gate (prospective only)

New transitions to `COMPLETED` require:

1. `workPerformed.trim().length >= 3`
2. at least one labor entry (zero minutes allowed)
3. every required Record `SATISFIED` or `WAIVED`
4. Asset-backed Work Orders: explicit Asset condition review
5. Location-only Work Orders: no Asset review (and a supplied review is rejected)

Optional and not gated: parts, part cost, Vendor, external cost.

Canceled Work Orders skip the gate. Legacy completed rows are not rewritten and must still load.

---

## Asset condition review

`RepairAssetConditionReview`: `NO_CHANGE` | `OPERATIONAL` | `DEGRADED` | `OUT_OF_SERVICE`.

- `NO_CHANGE` stamps reviewer/time and does not modify Asset condition.
- Other choices call `changeAssetStatus` in the same closeout transaction.
- Assigned STAFF may set condition only through authorized Work Order completion (`allowWorkOrderCloseoutTechnician`). `/assets/[id]` remains supervisor-gated.

---

## Authorization

| Actor | May | May not |
|---|---|---|
| Assigned STAFF | own labor, own parts, complete Records, enter work performed, complete if gate passes, scoped Asset review at completion | waive/configure requirements, Vendor/external cost, other employees’ labor, resolve Issue by completing the WO |
| SUPERVISOR+ | all of the above plus requirements, waiver, labor/parts correction, Vendor/external cost, post-completion allowed corrections | reopen completed/canceled Work Orders |

---

## History / audit

No `WorkOrderHistory` / `LaborHistory` / `PartsHistory`. Source facts are the child rows. Asset condition changes remain on `AssetStatusHistory`. Meaningful closeout, waiver, and post-completion corrections append `RepairUpdate`.

---

## Migration

`prisma/migrations/20261006090000_work_order_closeout/`

Additive only. No backfill.

Replay: `CREATE DATABASE ltc_verify_phase3d_replay_20261006 WITH TEMPLATE ltc_verify_phase3c_browser_20261005`, then `prisma migrate deploy`. Eight pre-3D `COMPLETED` Work Orders remained; no labor, parts, requirements, or review stamps were inserted.

---

## Tests

| Suite | Result |
|---|---|
| Closeout hermetic (gate, zero vs missing labor, Decimal expense, quantity/cost) | PASS (5) |
| Product eligibility — PLANT DEVELOPMENT | PASS |
| Phase 3D SQL scenarios 1–13 | PASS |
| Phase 3A / 3B / 3C SQL | PASS |
| Phase 10A SQL | PASS |
| Phase 12A Request SQL | PASS |
| Phase 12A Plant SQL | PASS |
| Location History | PASS |
| Knowledge versions | PASS |
| Playwright `@phase-3c` | PASS |
| Playwright `@phase-3d` | PASS — required Record blocks complete until SATISFIED; labor/part/expense visible; Issue OPEN; Request not resolved; Asset `OUT_OF_SERVICE` after `NO_CHANGE` |
| Playwright 12A dietary unit report form | FAIL — `/unit/[id]` is SPACE-first neighborhood runtime without `report-problem-form` when seed is absent. SQL 12A covers Request create. Not a closeout regression. |
| `prisma validate` | PASS |
| `tsc --noEmit` | PASS |
| `verify:migrations` | PASS — 118 migrations, newest `20261006090000_work_order_closeout` |
| targeted eslint (3D files) | PASS (0 errors) |
| `npx eslint .` | FAIL — 9 errors, 45 warnings — PRE-EXISTING (same classification as Phase 3C) |

Browser: facility password session on isolated `next start` against disposable `ltc_verify_phase3d_browser_20261006`. Seed still fails on dropped `Unit.facilityId_name` unique; plant-browser-fixtures bootstrap Terrace View.

---

## Product governance

`getDepartmentProduct("PLANT")?.status === "DEVELOPMENT"`. Not Marketplace-visible, not sellable, not customer-installable. No billing/entitlement changes.

---

## Explicit deferrals

Not implemented:

- inventory
- payroll / time clock
- Preventive Maintenance
- contracts / AP / purchase orders
- multi-vendor charges, tax, freight
- advanced analytics
- Work Order reopening
- Procedure architecture expansion
- AVAILABLE

---

## Phase 3D / PM gate

```text
READY FOR PM ARCHITECTURE
```

Corrective Request → Issue → Work Order → execution → closeout/evidence/cost is operationally coherent. Preventive Maintenance can now attach to this Work Order foundation. This certification does not implement PM.
