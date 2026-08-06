# Dietary Operational Evidence — Phase 9C Ownership Decision

**Date:** 2026-08-06  
**Branch:** `product/dietary-operational-evidence-phase-9c-2026-08-06`  
**Base tip:** `852763e80f6ad529d7a319b8ea25cb858497c413` (Phase 9B)

This document records the architecture trace and ownership decision required before Phase 9C implementation. Implementation must not begin until this decision is accepted in-repo.

---

## Architecture Trace (answers)

1. **Authoritative Templates today:** There is no single Operational Template. Production authority is split between `LogTemplate` + `LogTemplateField` (logs) and `InspectionDefinition` + `InspectionDefinitionItem` (inspections). Staffing templates (`OperationalAssignmentTemplate`) and day-phase definitions (`DepartmentOperationalCycle`) are not capture templates.

2. **Logs vs Inspections duplication:** Partially overlapping field/UX concepts, intentionally separate domains historically. Experience catalog `FORMS`/`CHECKLISTS` have no Prisma models and must not become a third capture engine.

3. **Production-active vs partial:** Logs and Inspections are production-active. Operations Engine (`OperationDefinition`/`OperationInstance`) is partial and stays disabled. Checklist capture models do not exist. Asset/Space attachment on existing log/inspection templates does not exist.

4. **Existing unified abstraction to complete:** None. Completing Experience FORMS as a third engine is a trap. Phase 9C introduces a new unified **Operational Template** family for Dietary evidence Runtime, without rewriting or merging legacy Log/Inspection storage.

5. **Template-version snapshot on completed records:** Legacy log/inspection submissions retain live FKs to mutable definitions — **not** version snapshots. Milestone corrections use append-only history. Phase 9C Evidence Records must snapshot published Template version context.

6. **Frequency today:** `LogRecurrence` on templates/assignments; `InspectionCadenceType` + due-time fields; cycles use Facility-local windows. Phase 9C schedules by Operational Cycle reference, fixed Facility-local window, once-per-date, or multi-cycle — not cron.

7. **Asset and Space attachment today:** None on Log/Inspection templates. Unit via `LogAssignment.unitId` or optional `InspectionDefinition.unitId`. Assets exist independently (repairs/PM/knowledge).

8. **Requirement occurrences:** Logs — derived. Inspections — persisted `InspectionOccurrence`. Cycles — derived. Job Flow — derived. **Phase 9C decision: derived requirements for the operational date** (see below).

9. **Active Runtime forms:** `/logs` submit, Unit Workspace logs, unit inspection submit, Servery milestones (online/offline), Job Flow (display only).

10. **Active Log Book:** `/logs` history tab (+ Service Log meal-event history). Not a unified evidence Log Book.

11. **Offline record types:** Only `RECORD_SERVERY_READY` and `RECORD_MEAL_SERVICE_STARTED`.

12. **Reuse:** Cycle DRAFT/PUBLISH/RETIRE + `stableKey`/`version`; derived Job Flow / Ops Board projections; Offline Runtime bundle + sync + conflict; Facility-local operational date; milestone append-preserving correction pattern; role/department scope patterns.

13. **Isolate:** `OPERATION_ENGINE_ENABLED` / Operations Engine; Experience FORMS/CHECKLISTS catalog; Task dual-write; `OperationalAssignmentTemplate` (staffing); legacy `LogTemplate` / `InspectionDefinition` surfaces (`/logs`, `/admin/inspections`) remain for existing workflows and are not rewritten by Phase 9C.

14. **Migration required:** Yes — additive migration for Operational Template + Evidence Record family (migration 67). Legacy tables untouched.

15. **Smallest coherent Phase 9C model:** One `OperationalTemplate` (typed LOG | CHECKLIST | INSPECTION) with fields, applicability, schedule, publish/version/retire; derived `EvidenceRequirement` projection; persisted `OperationalEvidenceRecord` with version snapshot; Job Flow / Supervisor Board / Log Book / offline command as consumers — not owners.

---

## Canonical Ownership

| Concept | Owns |
|--------|------|
| **OperationalTemplate** | Evidence definition: fields, validation, corrective-action rules, instructions, Department, applicability (Asset/Space/types), cycle or time-window schedule, frequency, publication/version |
| **EvidenceRequirement** (derived) | Expected occurrence for a Facility + Department + operational date + scope + window; due/upcoming/completed/not-confirmed/review state; points at published Template version |
| **OperationalEvidenceRecord** | What was entered; who; device; occurrence/recorded/synchronized times; corrective action; corrections/history; Template version snapshot |
| **Job Flow** | Displays requirements; does not own them |
| **Supervisor Board** | Displays exceptions; does not own them |
| **Log Book** | Searches/presents durable Evidence Records |
| **Asset** | Physical equipment identity |
| **Space / Unit** | Physical operating location |
| **DepartmentOperationalCycle** | Day-phase windows (referenced, not copied) |
| **UnitMealTime** | Meal service targets (referenced when meal-linked) |

Log, Checklist, and Inspection differ only by Template `purposeType` (presentation/terminology). They do **not** get separate ownership or storage systems in Phase 9C.

---

## Requirement Persistence Decision

**Requirements are deterministically derived for the requested operational date (and optionally a short near-term window for Upcoming).**

Rationale:

- Matches Operational Cycles and Job Flow (derived, not unbounded rows).
- Avoids generating prospective rows far into the future.
- Published Template + applicability + schedule + existing records + offline pending → resolver output.
- Evidence **Records** are persisted; historical Log Book reads records, not regenerated requirements.

Retired Templates stop creating prospective requirements. Completed records remain readable with original Template version snapshot.

---

## Legacy Boundary

- Do **not** delete, rewrite, or dual-write into `LogTemplate` / `InspectionDefinition` for Phase 9C Dietary evidence.
- Existing `/logs` and `/admin/inspections` remain available for legacy workflows.
- Phase 9C unified Builder / Evidence Runtime / Log Book are gated by `DIETARY_OPERATIONAL_EVIDENCE_ENABLED` (default false).
- `OPERATION_ENGINE_ENABLED` remains false and independent.

---

## Feature Activation (local)

```
DIETARY_OPERATIONAL_CYCLES_ENABLED=true
DIETARY_JOB_FLOW_ENABLED=true
DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
OPERATION_ENGINE_ENABLED=false
```

---

## Explicit Non-Goals

Phase 9C does **not** implement: general task generation, automatic scheduling, automatic Assignment generation, full Operations Engine, EVS or Plant Operations, work-order expansion, arbitrary formulas/scripts, legal electronic-signature claims, OCR, AI inspection decisions, hosted deployment, or real Terrace View Employee data.
