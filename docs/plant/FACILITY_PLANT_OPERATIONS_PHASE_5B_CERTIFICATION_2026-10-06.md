# Facility Plant Operations — Phase 5B Certification

**Date:** 2026-10-06  
**Mode:** ACT complete — starter configuration, Product identity, and documentation reconciliation  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Current reconciliation:** [2026-10-06](./FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-06.md)  
**Phase 5A:** [Phase 5A certification 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_5A_CERTIFICATION_2026-10-06.md)  
**Baseline:** `4995106` `feat(plant): reconcile product experience`

Facility Plant Operations remains **DEVELOPMENT**. This phase did not make the Product AVAILABLE, add billing, create fake Assets, persist PM Plans from starter install, add generic safety Procedures, or begin whole-Product release certification.

---

## Verdict

```text
PASS — READY FOR FINAL PRODUCT CERTIFICATION
```

Authorized Managers can add **Plant Operations starter configuration** from Plant Build Overview, review and select items, install Facility-owned drafts, and finish remaining items later without duplicates or overwrite. PM cadence presets fill schedule fields against a real Asset only. Product registry copy is release-ready while status stays DEVELOPMENT.

---

## Starter package

User-facing name: **Plant Operations starter configuration**.

Copy: optional examples to help the Facility get started. Not a compliance pack. Not required setup. Not certified templates.

Entry: Build → Facility Plant Operations → Overview → Add starter configuration (`?starter=1` opens the review panel). Contextual empty states on Work and Records link back. No auto-launch. No auto-install at Product installation.

---

## Work presets

Installed through shared `createDraftFromPreset` as **DRAFT** Work Plans. `presetKey` = `stableKey`. Applicability is department-wide. No Plant-only Work table. No auto-publish. No PM Plan.

| Preset | Purpose |
|--------|---------|
| Mechanical Room Round | Routine operational walkthrough of mechanical spaces |
| Building Walkthrough | General Facility condition observation |
| Exterior / Grounds Walkthrough | General exterior observation |
| Generator Visual Check | Visual operational check — not manufacturer PM |

---

## Record templates

Installed through canonical `OperationalTemplate` `createDraftFromPreset` as **DRAFT**. Ad-hoc. Empty applicability. Facility-owned after copy.

| Template | Purpose |
|----------|---------|
| Equipment Condition Inspection | Generic equipment observation |
| Mechanical Room Inspection | Generic mechanical-space observation |
| Generator Inspection | Generic visual generator-area observation |
| Basic Equipment Reading | Evidence reading — not a PM trigger |
| Post-Work Order Verification | Optional evidence after work — not closeout |

---

## Idempotency / ownership

Presence is derived from `presetKey` / `stableKey`. No `SETUP_COMPLETE` table or flag.

- Second install of the same identities reports already existed.
- Partial second install adds only remaining selected items.
- Facility edit / successor keeps `presetKey`; reinstall does not overwrite.
- After install, Managers edit, publish, supersede, and retire through normal Build rules.

---

## PM presets

UI-only in the existing PM Plan editor. Not starter objects.

| Preset | intervalMonths | generationLeadDays | priority |
|--------|----------------|--------------------|----------|
| Monthly | 1 | 7 | Routine |
| Quarterly | 3 | 7 | Routine |
| Semiannual | 6 | 7 | Routine |
| Annual | 12 | 7 | Routine |

Copy: presets only fill the schedule. Review the maintenance requirements for this Asset before publishing. A real Facility Asset is required. No example Asset. No Work Order from applying a preset.

---

## Getting Started

Starter step is now actionable for Manager+. Derived status: Not added / Partially added / Added. Unrelated checklist items stay factual. Run remains available throughout. No persisted setup-complete state.

---

## Product registry

| Field | Value |
|-------|-------|
| Official name | Facility Plant Operations |
| Local Department default | Plant Operations |
| shortDescription | Manage facility maintenance requests, Issues, Work Orders, Assets, recurring operational Work, and Preventive Maintenance in one operational workspace. |
| customerCapabilities | Maintenance Requests and triage; Issues and Work Orders; Asset maintenance history; Preventive Maintenance; Recurring facility rounds; Records and Procedures; Labor, parts, and vendor expense capture |
| status | DEVELOPMENT |
| Marketplace | hidden |
| Customer install | blocked |

---

## Documentation reconciliation

Created:

- `docs/plant/FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-06.md`
- `docs/plant/FACILITY_PLANT_OPERATIONS_PHASE_5B_CERTIFICATION_2026-10-06.md`

Updated:

- `docs/plant/README.md` — current state after 5B
- `docs/product/14_FACILITY_PLANT_OPERATIONS.md` — starter pack now implemented/optional
- `docs/plant/FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-05.md` — historical pointer
- `docs/plant/FACILITY_PLANT_OPERATIONS_PHASE_3D_CERTIFICATION_2026-10-06.md` — PM later certified in 4A–4D
- `docs/product/LEGACY_SURFACE_REGISTER.md` — `/repairs`, `/asset-issues`, `/preventive-maintenance`, `Repair`, `AssetIssue`, `PreventiveMaintenanceSchedule`, `preventiveScheduleId`
- `docs/product/08_PRODUCT_LANGUAGE_GUIDE.md` — recurring Work vs PM; Asset lifecycle vs condition; Plant Operations local name

Phase 12A guides remain LEGACY / HISTORICAL / SUPERSEDED. They were not rewritten.

---

## Authorization

| Role | Starter / PM preset |
|------|---------------------|
| Manager+ (password) | Can open starter review, select, and install. Can apply PM cadence presets and save drafts. |
| Supervisor | No starter install panel. May draft PM where existing Build policy already allows. Cannot publish Product-level starter configuration. |
| STAFF | No starter UI. No PM preset configuration. My Work unchanged. |

---

## Tests

### Hermetic

```text
src/lib/department-products/phase-5b-starter.hermetic.test.ts
src/lib/department-products/phase-5a-product-coherence.hermetic.test.ts
src/lib/department-products/department-products.hermetic.test.ts
src/lib/preventive-maintenance/phase-4c-builder.hermetic.test.ts
```

PASS — catalog, presence/idempotency copy-once, Work/Record draft presets, PM quarterly mapping, Getting Started derived states, DEVELOPMENT + release-prep copy.

### SQL (disposable)

```text
src/lib/department-products/phase-5b-starter.test.ts
```

PASS on disposable `ltc_verify_phase4b_sql_20261006` (4/4). Selective install, idempotency, partial second install, no overwrite after Facility successor, facility scoping, no fake Asset / PM Plan / Procedure from starter, PM quarterly mapping, DEVELOPMENT unchanged.

### Browser `@phase-5b @ci-gate`

```text
tests/plant-browser/phase-5b-starter.spec.ts
```

PASS — 3/3 on rebuilt `.next-plant-browser` against disposable `ltc_verify_phase4b_sql_20261006`.

| Scenario | Result |
|---|---|
| Manager select 2 Work + 1 Record, reopen Already added, install remaining, no duplicate, drafts, no extra PM | PASS |
| Quarterly preset on a real Asset: interval 3, lead 7, Routine; schedule preview; draft save; no generated WO | PASS |
| STAFF and Supervisor do not see starter install controls | PASS |

---

## Schema / migration

```text
No schema change.
No migration.
```

Starter presence is derived from existing `presetKey` / `stableKey`.

---

## Product governance

```text
Facility Plant Operations = DEVELOPMENT
```

Marketplace hidden. Customer install blocked. No billing SKU.

---

## Remaining V1 deferrals

Still deferred: inventory, purchasing, payroll, meter PM, IoT, predictive, advanced analytics, contracts, warranties, Product AVAILABLE.

---

## Final certification gate

```text
READY FOR FINAL PRODUCT CERTIFICATION
```

Remaining work is whole-Product release certification, not Product-finishing implementation.
