# Dietary Asset Operations — Phase 10A

**Date:** 2026-08-06  
**Branch:** `product/dietary-assets-work-orders-phase-10a-2026-08-06`  
**Base tip:** `8688184cdaecf3ce3d6c651a04bef870ae20ec36` (Phase 9C.1)  
**Mode:** ACT — PRODUCT PHASE 10A

See also: [`DIETARY_ASSET_OPERATIONS_PHASE_10A_OWNERSHIP_2026-08-06.md`](./DIETARY_ASSET_OPERATIONS_PHASE_10A_OWNERSHIP_2026-08-06.md)

## Purpose

Complete the Dietary Asset issue-and-repair operating path:

Asset Registry → Location / Department responsibility → Operational Evidence →  
Asset condition or reported Issue → Supervisor triage → Repair / Work Order →  
Internal or Vendor response → Resolution and return to service → Durable Asset history

## Architecture trace (summary)

| Question | Answer |
|----------|--------|
| Authoritative Asset | Prisma `Asset` (single registry) |
| Authoritative Work Order | Prisma `Repair` |
| Issue vs WO today (pre-10A) | Unified façade (`Repair` = Issue = WO) |
| Phase 10A Issue | New `AssetIssue` — separate row |
| Evidence | `OperationalEvidenceRecord` — unchanged ownership; optional links via `AssetIssueEvidenceLink` |
| Asset condition | Stored `AssetStatus` + append-preserving `AssetStatusHistory` |
| Vendor scope | Facility-scoped `Vendor` |
| Offline Issue | `REPORT_ASSET_ISSUE` command (scoped) |

## Canonical ownership

| Concept | Owner |
|---------|--------|
| Equipment identity & operational status | **Asset** (+ `AssetStatusHistory`) |
| Routine readings / checks / inspections | **Operational Evidence** |
| Reported problem / observed condition | **Asset Issue** |
| Repair response / work performed | **Work Order** (`Repair`) |
| Exception projection | Supervisor Operations Board (derived) |
| Job Flow Asset cues | Job Flow (derived) |

Evidence, Asset Issue, and Work Order are never the same row.

## Asset contract

Operational statuses (product): `OPERATIONAL`, `DEGRADED`, `OUT_OF_SERVICE`, `RETIRED`.  
Legacy `ACTIVE` is normalized to `OPERATIONAL` (backfilled in companion migration).

Status changes write `AssetStatusHistory`. Retired Assets remain visible in historical Evidence and repair records. Assets with history are not deleted.

Identity fields include Facility, Department, Unit (optional Space), type, name, facility Asset number, manufacturer, model, serial, description, in-service / warranty dates, preferred Vendor, procedure instructions, retirement attribution.

## Issue lifecycle

`REPORTED` → `ACKNOWLEDGED` → `TRIAGED` → `MONITORING` | Work Order created → `RESOLVED` / `CLOSED` / `CANCELLED`  
Reopen is supported when appropriate.

Operational impact (neutral language): no immediate service impact, workaround available, service at risk, equipment unavailable.

Frontline reporting does **not** create a Work Order. Completing a Work Order does **not** close an Issue.

## Work Order lifecycle

Persisted on `Repair` with expanded statuses:  
`OPEN`, `ASSIGNED`, `IN_PROGRESS`, `WAITING_PARTS`, `WAITING_ON_VENDOR`, `ON_HOLD`, `COMPLETED`, `CANCELLED`  
(`CLOSED` retained for legacy rows.)

A completed Work Order does **not** return an Asset to `OPERATIONAL`. Return to service is an explicit Asset-status action (`RETURN_TO_SERVICE`).

## Vendor and responsible party

- Facility-scoped Vendor registry (existing).
- Foreign Vendor IDs fail safely.
- Optional internal responsible Department / assigned Employee on the Work Order.
- No Vendor portal. Frontline views do not expose Vendor management details.

## Evidence relationship

- Create Issue from Evidence Record / link Evidence to Issue.
- Navigate Issue ↔ Evidence.
- Evidence is never mutated by Issue or Work Order status changes.
- No automatic Work Order from out-of-range Evidence.

## Runtime behavior

**Employee / Unit Workspace:** scoped Asset status, workaround, open Issue notice, Report Issue, sync state. No Vendor cost, management notes, or WO administration.

**Supervisor Operations Board:** Asset / Equipment exception group (new Issues, OOS/degraded, untriaged, waiting Vendor/parts, overdue targets, evidence-linked Issues, workarounds, missing config). Navigation only — no board-side mutations.

## Offline behavior

Command: `REPORT_ASSET_ISSUE`  
Requirements: stable client command ID, idempotent sync, scoped Facility/Department/Unit/Asset, observed time, replay safety, user-change isolation, Unit-rebind non-retargeting, retired/foreign Asset rejection.  
No offline Work Order management or Vendor assignment. Local pending is never claimed as server-visible until sync receipt.

## Authority

| Role | Capabilities |
|------|----------------|
| STAFF / LEAD | View scoped status; report Issue; limited own-report view |
| SUPERVISOR | Triage; create/update WO where policy allows; status change; no full Builder |
| MANAGER / GM | Manage Assets, Issues, WOs, Vendors, status, retirement |
| FA alone | Denied without Dietary operational relationship |
| Quick PIN | May report; never Builder / Vendor / WO manage |

## Feature activation

```env
DIETARY_ASSET_OPERATIONS_ENABLED=true
OPERATION_ENGINE_ENABLED=false
```

Independent of Template / Evidence / Job Flow / Cycles flags (those remain separately controlled). Default `false`. Disabled behavior is safe.

## Database

Migrations:

- `20260806200000_dietary_asset_operations_phase_10a`
- `20260806200100_dietary_asset_status_operational_backfill`

Additive only. Never apply to `ltc_manager`. Disposable PostgreSQL 16 only.

## Performance

Designed for ~17 serverys, multiple Assets per servery, 30+ days history, open Issues/WOs. List/profile/board loaders avoid N+1 Vendor/history fan-out. No Redis or background materialization.

## Legacy boundaries

- Pre-10A `/issues/[id]` Repair façade remains for legacy intake when flag off.
- When flag on, Dietary Asset Operations uses `AssetIssue` + `Repair` as WO.
- Legacy `/logs` and `/admin/inspections` unchanged.

## Known limitations

- Projected Unit Workspace path does not yet host the new Asset panels (classic workspace does).
- Full Plant Operations, PM engine, inventory/parts, POs, Vendor portal, AP, capital/depreciation, automatic WOs, AI diagnosis, IoT, EVS, clinical equipment, PHI, hosted deploy, and real Terrace View Employee data are **out of scope**.

## Phase 10B boundary (suggested)

Preventive maintenance scheduling, richer Vendor capability scoping, Plant Operations Department workflow, parts/inventory hooks, and projected-workspace Asset panels.

## Local verification

```bash
env -u NODE_ENV npm run verify:static
env -u NODE_ENV npm run test:hermetic
env -u NODE_ENV npm run verify:build
# disposable PG16:
VERIFY_DATABASE_URL=… env -u NODE_ENV npm run verify:db
npm run test:asset-operations-browser
# plus existing browser gates
```
