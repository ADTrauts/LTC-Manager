# Dietary Template Builder — Phase 9C.1

**Date:** 2026-08-06  
**Branch:** `product/dietary-template-builder-closeout-phase-9c1-2026-08-06`  
**Base:** Phase 9C tip `7fb02ffe83507273d34c1a6aa4f15b5469a8e16e`  
**Mode:** ACT — PRODUCT PHASE 9C.1

Closes the Phase 9C finding that the Runtime/domain supported richer Template configuration than the manager-facing Builder exposed.

## Purpose

Managers can configure and publish complete Dietary Operational Templates (LOG, CHECKLIST, INSPECTION) through normal UI controls — without fixtures, SQL, JSON editing, or developer scripts.

## UI Gap Matrix (closed)

| Property | Phase 9C | Phase 9C.1 |
|----------|----------|------------|
| Blank Template create (LOG/CHECKLIST/INSPECTION) | Missing | Fully editable |
| Field editor (12 types, reorder, validation, corrective) | Preset-only | Fully editable |
| Applicability (Asset / type / Space / type / Unit) | Preset / read-only note | Fully editable |
| Scheduling (cycle / fixed / once / ad-hoc) | Preset cycle keys | Fully editable |
| Draft preview | Missing | Fully editable |
| Publish with validation | Button only | Save & publish with client validation |
| Published read-only view | List counts | View opens editor read-only |
| Successor version | Service-only | UI Create successor |
| Retirement | Button, no confirm | Confirm dialog + audit |
| Offline evidence enqueue | Types/server only | Form + bundle `evidenceContext` + sync envelope |
| Conflict / rejected visibility | Milestone-oriented | Evidence status on form + Supervisor receipt board |

## Manager workflows

See [`DIETARY_OPERATIONAL_TEMPLATE_MANAGER_GUIDE.md`](./DIETARY_OPERATIONAL_TEMPLATE_MANAGER_GUIDE.md) for:

- Blank Template creation  
- Field editor  
- Validation  
- Corrective action  
- Applicability  
- Scheduling  
- Preview  
- Publish  
- Successor version  
- Retirement  

## Offline Evidence

- Offline bundle now includes scoped `evidenceContext` for DUE/UPCOMING/NOT_CONFIRMED/NEEDS_REVIEW requirements.
- `SUBMIT_OPERATIONAL_EVIDENCE` sync envelopes retain the `evidence` payload (`toSyncEnvelope` fix).
- Tablet form shows Offline / Saved on This Tablet / Synchronizing / Synchronized / Conflict / Rejected.
- Purely local pending commands are **not** claimed as Supervisor-visible until a sync receipt or conflict exists.

## Legacy boundary

| Surface | Status |
|---------|--------|
| `/staffing/templates` + Job Flow evidence + Log Book | **Authoritative** for new Dietary Operational Evidence |
| Legacy `/logs` (LogTemplate) | Remains for historical/legacy capture — **not migrated** |
| Legacy `/admin/inspections` | Remains isolated — **not migrated** |

Duplicate configuration is prevented by Product guidance: new Dietary evidence uses Operational Templates only. Legacy nav is unchanged (not hidden); document as deprecated for new Dietary work.

## Verification classification

| Area | Classification |
|------|----------------|
| Blank LOG builder → publish | Browser verified (Playwright) |
| Field / applicability / schedule editors | Browser + hermetic validation |
| Successor + retire | Browser verified |
| CHECKLIST / INSPECTION blank create | Browser verified |
| In-range / out-of-range / corrective / Log Book | Browser verified (Phase 9C + 9C.1) |
| Offline submit + refresh persistence | Browser verified |
| User-change isolation | Browser verified |
| Exactly-once / response-loss / version conflict | Service/SQL + partial browser; full response-loss remains SERVICE PASS where not separately instrumented |
| STAFF / FA-alone / Quick PIN Build denial | Browser + SQL/hermetic |
| Cross-facility rejection | SQL verified |
| Template publish/successor/retire/history snapshot | SQL verified (`phase-9c1-template-builder.test.ts`) |

## Explicit non-goals (unchanged)

No new field types, formulas, conditional scripting, nested repeaters, automatic scheduling/assignments, Operations Engine, EVS/Plant, hosted staging, or real Terrace View Employee data.

## Feature flags

```
DIETARY_OPERATIONAL_CYCLES_ENABLED=true
DIETARY_JOB_FLOW_ENABLED=true
DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
OPERATION_ENGINE_ENABLED=false
```

## Migrations

No new migration. Remains **67** migrations; newest `20260806180000_dietary_operational_evidence_phase_9c`.
