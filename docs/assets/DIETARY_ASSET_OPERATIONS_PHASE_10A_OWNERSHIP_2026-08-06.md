# Dietary Asset Operations — Phase 10A Ownership Decision

**Date:** 2026-08-06  
**Branch:** `product/dietary-assets-work-orders-phase-10a-2026-08-06`  
**Base tip:** `8688184cdaecf3ce3d6c651a04bef870ae20ec36` (Phase 9C.1)  
**Mode:** ACT — PRODUCT PHASE 10A

## Starting verification

| Item | Value |
|------|-------|
| Phase 9C.1 branch | `product/dietary-template-builder-closeout-phase-9c1-2026-08-06` |
| Local tip | `8688184cdaecf3ce3d6c651a04bef870ae20ec36` |
| Remote tip | `8688184cdaecf3ce3d6c651a04bef870ae20ec36` |
| Frozen release | `release/dietary-v1-pilot-certified-2026-08-05` @ `80353dfcc870f4bd53de95cad3fd91d93ba5056b` |
| Local main | `704adc72abb46705a4451608a2fadf84215f42be` |
| origin/main | `6380b661a64e8f020d16813342945797a50bc0e0` |
| Migrations | 67 |
| Working tree at branch | Clean and synchronized with origin Phase 9C.1 |
| `ltc_manager` | Untouched (disposable PG16 only) |
| `OPERATION_ENGINE_ENABLED` | Remains `false` |

## Architecture trace (15 answers)

1. **Authoritative Asset:** Prisma `Asset` (`prisma/schema.prisma`). Single registry — no second Asset table.
2. **Authoritative Work Order:** Prisma `Repair` (product language: Work Order / repair response). Remains SoT for repair work.
3. **Issue vs Repair duplication today:** Product Issue is a **façade** over the same `Repair` row (`/issues/[id]`, `issueType`). Physically one row = Issue = Work Order. Phase 10A **separates** them.
4. **Active paths:** `/assets`, `/repairs`, `/issues/[issueId]`, Unit quick-issue (`createUnitIssueAction`), Plant readiness signals, evidence `assetId` links.
5. **Legacy / partial:** `/repairs/[id]` redirect; Attachment metadata unused by UI; PM schedules model-only; `WorkOrderKind.PREVENTIVE` unused by create UX; no Asset detail page; no Asset status history.
6. **Asset Builder:** Basic registry only — **not** Phase 10A complete (no profile, DEGRADED, retirement audit, manufacturer/warranty, evidence/issue/WO panels).
7. **Condition:** Coarsely **stored** as `AssetStatus` (`ACTIVE` / `OUT_OF_SERVICE` / `RETIRED`). Not inferred from Issues. No `DEGRADED`.
8. **Vendor scope:** Facility-scoped (`Vendor.facilityId` + unique name). Validated on Asset/Repair create. No portal.
9. **Issue without WO today:** Impossible — same row.
10. **WO without Issue today:** Impossible as separate concepts — every Repair is the report.
11. **Evidence → Asset:** `OperationalEvidenceRecord.assetId`; template applicability `SPECIFIC_ASSET` / `ASSET_TYPE`. No Issue↔Evidence join.
12. **History:** Repair/Evidence append-preserving; **Asset status overwrite only** (no history table).
13. **Offline issue reporting:** **Absent.** Offline commands are milestone + evidence only.
14. **Schema required:** Yes — operational status expansion + history; **new AssetIssue** (separate from Repair); Issue↔Evidence; Issue↔Work Order link; WO lifecycle / return-to-service fields; offline Issue command + receipt linkage; feature flag (env only).
15. **Smallest coherent Phase 10A architecture:** Keep one `Asset` registry; introduce `AssetIssue` as reported-condition SoT; keep `Repair` as Work Order SoT; optional links Issue→WO and Issue↔Evidence; append-preserving Asset status history; gate with `DIETARY_ASSET_OPERATIONS_ENABLED`; do not auto-create WO from evidence; do not auto-return Asset to service on WO complete.

## Canonical ownership (Phase 10A)

| Concept | Owner | Persistence |
|---------|--------|-------------|
| Physical equipment identity & operational status | **Asset** | `Asset` + `AssetStatusHistory` |
| Routine readings / checks / inspections | **Operational Evidence** | `OperationalEvidenceRecord` (unchanged ownership) |
| Reported problem / observed condition | **Asset Issue** | **New** `AssetIssue` (+ updates / evidence links) |
| Repair response / work performed | **Work Order** | Existing `Repair` (extended lifecycle) |
| Exception projection | Supervisor Operations Board | Derived only — no ownership |
| Job Flow display of Asset condition | Job Flow | Derived only — no ownership |

### Explicit separation rules

- Evidence, Asset Issue, and Work Order are **never** the same row.
- An Issue **may** exist without a Work Order (report + triage / monitoring).
- A Work Order **may** be created directly by authorized Manager without a prior Issue (when policy allows), and **may** be linked to a source Issue.
- Completing a Work Order does **not** change Asset status or close an Issue automatically.
- Returning an Asset to `OPERATIONAL` is an **explicit** Asset-status action.
- Closing an Issue is an **explicit** Issue action.

### Legacy Issue façade

Pre-Phase-10A `/issues/[id]` and Unit quick-issue paths that create `Repair` rows remain for non–flag-gated legacy intake. When `DIETARY_ASSET_OPERATIONS_ENABLED=true`, Dietary frontline reporting and Supervisor triage use **AssetIssue** (+ optional Work Order via `Repair`). Documentation marks the unified Repair-as-Issue façade as legacy for Dietary Asset Operations.

## Feature activation

- Flag: `DIETARY_ASSET_OPERATIONS_ENABLED` (default `false`)
- Does not enable `OPERATION_ENGINE_ENABLED`
- Independent of Template / Evidence / Job Flow / Cycles flags (those may still be required for related panels)

## Out of scope (confirmed)

Full Plant Operations, PM scheduling engine, inventory/parts, POs, vendor portal, AP, capital/depreciation, automatic WO from evidence, AI diagnosis, IoT, EVS, clinical equipment, PHI, hosted deploy, real Terrace View Employee data.
