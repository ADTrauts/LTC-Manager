# Dietary Operational Evidence — Phase 9C

**Date:** 2026-08-06  
**Branch:** `product/dietary-operational-evidence-phase-9c-2026-08-06`  
**Base:** Phase 9B tip `852763e80f6ad529d7a319b8ea25cb858497c413`

Ownership decision (required before implementation):  
[`DIETARY_OPERATIONAL_EVIDENCE_PHASE_9C_OWNERSHIP_2026-08-06.md`](./DIETARY_OPERATIONAL_EVIDENCE_PHASE_9C_OWNERSHIP_2026-08-06.md)

## Architecture Trace (summary)

Production capture was split between legacy `LogTemplate` and `InspectionDefinition`. Phase 9C introduces a **unified Operational Template** family for Dietary evidence Runtime without rewriting those legacy surfaces.

Requirements are **derived** for an operational date. Evidence Records are **persisted** with `templateSnapshotJson` so later Template edits never rewrite history.

## Canonical Ownership

| Concept | Owns |
|--------|------|
| OperationalTemplate | Fields, validation, corrective rules, applicability, schedule, publish/version |
| EvidenceRequirement (derived) | Due/upcoming/completed/not-confirmed state for a date+scope+window |
| OperationalEvidenceRecord | Entry values, attribution, times, corrective action, corrections |
| Job Flow / Supervisor Board | Display only |
| Log Book | Search/present durable records |
| Asset / Space | Physical identity / location |
| DepartmentOperationalCycle / UnitMealTime | Referenced windows and meal targets |

## Unified Template Contract

One model with `purposeType`: `LOG` | `CHECKLIST` | `INSPECTION`.

Field types: Short/Long text, Number, Temperature, Yes/No, Pass/Needs Attention, Single/Multi select, Date, Time, Attestation, Optional comment.

## Reference Templates (Draft presets)

1. Cooler Temperature Log  
2. Dishwasher Sanitizer Log  
3. Opening/Closing Checklist  

Never auto-published. No Terrace View-specific Asset IDs.

## Applicability and Scheduling

Asset, Asset type, Space, Space type, Department unit.  
Schedules: Operational Cycle (by `stableKey`), fixed Facility-local window, once per date, ad hoc when allowed.

## Publishing and Versioning

DRAFT → PUBLISHED (immutable version) → RETIRED. Changes create successor versions. Historical records keep snapshot labels/standards.

## Requirement Resolution

Server-side `resolveEvidenceRequirements` for Facility + Department + operational date (+ unit/asset scope). States include UPCOMING, DUE, COMPLETED, COMPLETED_WITH_CORRECTIVE_ACTION, NEEDS_REVIEW, NOT_CONFIRMED, NOT_APPLICABLE, NOT_CONFIGURED, SAVED_ON_THIS_TABLET, SYNCHRONIZING, CONFLICT_REVIEW.

Missing after window → “Record Not Submitted” / Not Confirmed — never “failed” or “Blocked.”

## Job Flow / Evidence Entry / Corrective Action / Supervisor Board / Log Book / Offline

See Manager Guide and Log Book Guide. Offline command: `SUBMIT_OPERATIONAL_EVIDENCE` (scoped bundle, idempotent sync, conflict preservation, user-change and unit-rebind isolation).

## Authority

STAFF/LEAD: submit applicable published requirements.  
SUPERVISOR: department evidence status, Log Book, corrections/conflicts.  
MANAGER/GM: Template manage/publish.  
FA alone without Dietary operational relationship: denied.  
Quick PIN: may submit; no Build/Supervisor Board.

## Feature Activation

```
DIETARY_OPERATIONAL_CYCLES_ENABLED=true
DIETARY_JOB_FLOW_ENABLED=true
DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
OPERATION_ENGINE_ENABLED=false
```

Flag default: **false**. Does not enable Operations Engine.

## Performance

Batched projections for Job Flow evidence, Supervisor evidence summary, Log Book first page. No Redis/microservices. Pilot scale: ~100 Employees, ~17 serverys, 30+ days Log Book history.

## Database

Migration `20260806180000_dietary_operational_evidence_phase_9c` (67 total). Additive only.

## Explicit Non-Goals

Phase 9C does **not** implement: general task generation, automatic scheduling, automatic Assignment generation, full Operations Engine, EVS or Plant Operations, work-order expansion, arbitrary formulas/scripts, legal e-signature claims, OCR, AI inspection decisions, hosted deployment, or real Terrace View Employee data.

## Known Limitations

- Legacy `/logs` and `/admin/inspections` remain separate; not migrated into Operational Templates in this phase.
- Tablet-pending offline commands are not fully server-visible until sync/retry receipts exist; Supervisor Board surfaces RETRY_REQUIRED receipts and PENDING conflicts.
- Some offline edge cases (response-loss replay instrumentation, unit-rebind isolation browser path) are covered primarily at service/SQL layers — see Phase 9C.1 classification.

## Next-phase Boundary

Phase 9C.1 closes Builder field/applicability/scheduling editors, successor/retire UX, and offline Evidence tablet enqueue. Remaining optional work: deeper Log Book export, optional legacy template migration, and broader response-loss browser instrumentation.

## Phase 9C.1 follow-up

See [`DIETARY_TEMPLATE_BUILDER_PHASE_9C1_2026-08-06.md`](./DIETARY_TEMPLATE_BUILDER_PHASE_9C1_2026-08-06.md).
