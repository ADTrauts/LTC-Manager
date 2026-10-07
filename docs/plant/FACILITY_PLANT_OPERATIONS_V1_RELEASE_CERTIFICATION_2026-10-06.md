# Facility Plant Operations — V1 Release Certification

**Date:** 2026-10-06  
**Mode:** VERIFY / CERTIFY / RELEASE-GATE ONLY  
**Classification:** AUTHORITATIVE release-gate record  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Current reconciliation:** [2026-10-06](./FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-06.md)  
**Baseline:** `1ad1f20` `feat(plant): add starter configuration and release prep`

Facility Plant Operations remains **DEVELOPMENT** in committed Product configuration. This document does not flip `AVAILABLE`, add billing, or add features.

---

## Verdict

```text
CERTIFIED — READY TO SET AVAILABLE
```

A new eligible Facility can install, configure, and operate Facility Plant Operations V1 without Harbor, `PLANT_OPERATIONS_ENABLED`, manual database edits, or Vssyl staff seeding content. The AVAILABLE flip remains a separate explicit action.

---

## Product scope

Implemented V1:

- Product install of `PLANT` as local Department **Plant Operations**
- Optional starter configuration (four Work drafts, five Record drafts)
- Request intake from Unit/Space
- Issue and Work Order corrective loop, including location-only
- Work Order closeout (labor, parts, work performed, required Records, Asset condition review)
- Independent Issue / Request resolution
- Preventive Maintenance Plans, fixed calendar cadence, generator, skip, no-Procedure Plans
- PM finding → Issue → distinct corrective Work Order
- Asset location and Procedure/template version history
- Build / Run IA and Product nouns
- Role isolation: requester, STAFF, Supervisor, Manager, Facility Administrator

Not in V1: inventory, purchasing, payroll, meter PM, IoT, predictive, advanced analytics, vendor contracts, warranties, billing SKU, `AVAILABLE` in committed registry.

---

## Certification-time fixes

Small release-entitlement branch only. Architecture unchanged.

Work Plans, Records, and their runtime loaders used the sync `PLANT_OPERATIONS_ENABLED` flag. Asset Operations and Preventive Maintenance already used `isPlantRuntimeEnabled`. After Product install under controlled `AVAILABLE`, starter Work/Record install failed without the env flag.

Fixed to use existing `isDepartmentEngineEnabledForFacility` (Plant runtime) in:

- `src/lib/department-work/authority.ts`
- `src/lib/department-work/load-runtime-work.ts`
- `src/lib/operational-evidence/evidence-authority.ts`
- `src/lib/operational-evidence/load-runtime-evidence.ts`

Test-only Product status overlay added in `registry.ts`. It never mutates committed `DEPARTMENT_PRODUCTS`. Production Next.js refuses the overlay unless `ALLOW_DEPARTMENT_PRODUCT_STATUS_OVERRIDE=1`.

---

## Gating

### Committed DEVELOPMENT

| Check | Result |
|-------|--------|
| `getDepartmentProduct("PLANT").status` | DEVELOPMENT |
| Marketplace | hidden |
| Customer install | `UNAVAILABLE_PRODUCT` |
| Customer operability even if installed + entitled | false |
| Internal development install | creates `PLANT` Department only |
| Product install creates Assets / Work / Records / PM / Procedures | no |
| Harbor-only runtime on installed DEVELOPMENT | yes |
| Normal customer runtime on installed DEVELOPMENT without flag | no |

### Controlled AVAILABLE (test overlay)

| Check | Result |
|-------|--------|
| Eligible Facility sees Product | yes |
| Customer `installDepartmentProduct("PLANT")` | creates `PLANT` / Plant Operations |
| Runtime without `PLANT_OPERATIONS_ENABLED` | yes |
| Harbor required | no |
| Build / Run / starter / Asset / PM / corrective | yes |
| Overlay cleared | committed status DEVELOPMENT |
| Dietary | still AVAILABLE |
| EVS | still DEVELOPMENT |

Dietary requester intake still uses Dietary Job Flow entitlement. That is Dietary gating, not a Plant env-flag dependency.

---

## Whole-Product journeys (SQL)

Disposable DB: `ltc_verify_plant_release_20261006`. Full migration chain: **120** applied, none pending. `ltc_manager` was never targeted.

Clean bootstrap created Organization + Facility in Prisma and installed Products. No seed, no `Unit.facilityId_name` repair.

| Journey | Result |
|---------|--------|
| New Facility setup / starter / real Asset / quarterly PM | PASS |
| Corrective Request → Issue → Work Order → closeout → explicit resolve | PASS |
| Location-only ceiling leak | PASS — no fake Asset |
| PM generate / no-Procedure / fixed cadence | PASS — April completed late, July remained 2027-07-15 |
| PM finding → Issue OPEN after PM COMPLETED → distinct corrective WO | PASS |
| Asset move Location A → B | PASS — historical WO stayed A; later PM used B |
| Roles: requester cannot triage; STAFF cannot publish PM; FA without Plant primary denied | PASS |

---

## Browser certification

`tests/plant-browser/plant-release.spec.ts` (`@plant-release` `@ci-gate`) against the same disposable DB. Seed still fails on dropped `Unit.facilityId_name` unique; `plant-browser-fixtures` bootstraps Terrace View. That seed defect does **not** block Product install (SQL clean-facility path).

| Test | Result | Time |
|------|--------|------|
| 1 Build Overview, starter subset, real Asset, quarterly PM draft | PASS | 8.3s |
| 2 Requester Received → triage → assigned technician closeout; Issue remains OPEN | PASS | 10.6s |
| 3 PM Run IA (Assets / Work Orders / Issues / Preventive / Vendors); no generator terminology | PASS | 3.5s |
| 4 STAFF stay on My Work; requester cannot Build; FA without Plant primary cannot triage | PASS | 7.2s |
| 5 DEVELOPMENT marketplace hides Plant; Dietary remains visible; committed status DEVELOPMENT | PASS | 2.2s |

Suite result: **5 passed (33.6s)**. First retry failed tests 2 and 3 for fixture reasons only (unassigned Work Order; `Preventive` locator matched nav + filter). Certification-time test fixes: assign technician at triage; scope Run IA locators to `maintenance-sub-nav`. Product behavior was already correct.

Historical `@ci-gate` suites (3C, 5A, 5B) remain the detailed UI regression.

---

## Role matrix

| Actor | Can | Cannot |
|-------|-----|--------|
| Requester (outside Plant) | Report Request; see Received / Accepted / In Progress / Resolved / Declined | Triage; create Issue/WO; Build; skip PM |
| STAFF / technician | My Work; execute assigned WO; labor; parts; Records; closeout; Issue from permitted finding | Publish/retire PM; starter action; triage; resolve Issue; assign arbitrarily; Build |
| Supervisor | Run; Issues; assign; skip PM; draft PM | Publish/retire PM; Manager-only starter install |
| Manager | Build; publish/retire PM; starter; full corrective/PM operations | — |
| Facility Administrator | Purchase Products when policy allows | No Plant operational power unless primary Department is Plant |

---

## IA and terminology

Run (SUPERVISOR+): Assets, Work Orders, Issues, Preventive, Vendors.

Build: Overview, Locations, Operating Rhythm, Work, Maintenance, People & Coverage, Records. Menus hidden. Getting Started present. Starter Manager+ only.

Customer-visible nouns: Request, Issue, Work Order, Preventive Maintenance, Asset. Persistence names (`Repair`, `/repairs`, `AssetIssue`) remain compatibility.

---

## Static / discovery / SQL regressions

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS after browser spec type fix |
| `npx prisma validate` | PASS |
| Migration integrity on disposable DB | 120 applied, 0 pending |
| `verify:discovery` | PASS — 358 files, 42 SQL-backed |
| Targeted eslint on Plant release surfaces | PASS |
| Hermetic release-gate + eligibility + 5A/5B | PASS |
| SQL `plant-release.test.ts` | PASS 5/5 |
| SQL Phase 5B starter | PASS |
| SQL Phase 3C | PASS |
| SQL Phase 3D | PASS when run alone (shared-DB `repairCode` collision if batched) |
| SQL Phase 4B | PASS on clean disposable DB |
| CI SQL fail-closed | `verify:db` requires `VERIFY_DATABASE_URL`; hermetic unsets SQL env so suites skip intentionally; new SQL file throws in CI if URL missing |

---

## Documentation classification

| Item | Class |
|------|-------|
| Seed `Unit.facilityId_name` upsert | ACCEPTED V1 DEFERRAL for demo seed; fixtures bootstrap; Product install does not need seed |
| `/repairs`, `Repair`, `AssetIssue` persistence names | ACCEPTED V1 compatibility |
| No billing / Stripe SKU | ACCEPTED V1 DEFERRAL |
| Inventory, meter PM, IoT, analytics, contracts | ACCEPTED V1 DEFERRAL |
| 14 vs implementation after 5B + this cert | DOC consistent; 14 remains DEVELOPMENT until explicit flip |

---

## Release blockers

```text
NONE
```

---

## Recommendation

```text
YES — READY FOR AVAILABLE FLIP
```

Do not flip in this commit. Wait for explicit approval. Do not add billing in the same action.

---

## Release addendum — 2026-10-07

Facility Plant Operations V1 became **AVAILABLE** after successful whole-Product release certification on October 7, 2026.

Canonical registry (not the test overlay):

```text
getDepartmentProduct("PLANT").status === "AVAILABLE"
```

Unrelated Products: Dietary remains AVAILABLE. EVS remains DEVELOPMENT. No billing SKU. No schema change. No new V1 features.
