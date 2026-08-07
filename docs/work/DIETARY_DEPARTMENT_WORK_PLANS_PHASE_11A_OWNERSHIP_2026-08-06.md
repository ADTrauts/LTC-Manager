# Dietary Department Work Plans — Phase 11A Ownership Decision

**Date:** 2026-08-06  
**Branch:** `product/department-work-plans-phase-11a-2026-08-06`  
**Base tip:** `c5d264c67738fc4978a5f347b36eba3366c30596` (Phase 10A)  
**Mode:** ACT — PRODUCT PHASE 11A

This document records the architecture trace and ownership decision required before Phase 11A implementation. Implementation must not begin until this decision is accepted in-repo.

---

## Starting verification

| Item | Value |
|------|-------|
| Phase 10A branch | `product/dietary-assets-work-orders-phase-10a-2026-08-06` |
| Local / remote tip | `c5d264c67738fc4978a5f347b36eba3366c30596` |
| Frozen release | `80353dfcc870f4bd53de95cad3fd91d93ba5056b` |
| Local main | `704adc72abb46705a4451608a2fadf84215f42be` |
| origin/main | `6380b661a64e8f020d16813342945797a50bc0e0` |
| Migrations at start | 69 |
| Working tree at branch | Clean; synchronized with origin Phase 10A |
| Render services | None listed |
| `ltc_manager` | Untouched; disposable PG16 only |

---

## Architecture Trace (answers)

1. **Wave-era Task intent:** Unified work queue projection for logs, repairs, inspections, coverage, and ad-hoc items (`Task` + `TaskType` / `TaskSourceType`). Dual-write from source domains when `TASK_SYNC_ENABLED`.

2. **Dual-write meaning:** When `TASK_SYNC_ENABLED=true`, source writes (LogSubmission, Repair, InspectionSubmission/Finding/Occurrence) upsert a `Task` row keyed by `(facilityId, sourceType, sourceId)`. Default is **false**; production Dietary path does not rely on it.

3. **Why Operations Engine stays disabled:** `OPERATION_ENGINE_ENABLED` gates OperationDefinition/Instance generation and Operations Center engine paths that are incomplete and not certified for Dietary pilot. Enabling it would reactivate unbounded occurrence generation and unfinished engine assumptions.

4. **Actively used today:** Assignments, Cycles, Job Flow, Evidence Templates/Records, Assets/Issues/Work Orders (`Repair`), Offline commands, KnowledgeArticle (Admin procedures/resources), classic Unit Workspace.

5. **Dormant but safe:** `Task` model + dual-write helpers (flag off); `TODAYS_WORK_ENABLED` (default on for Wave 4 routes); projection flags default off (`PROJECTION_UNIT_WORKSPACE_ENABLED=false`).

6. **Legacy to isolate:** Wave `Task` dual-write; Operations Engine; Experience FORMS/CHECKLISTS catalog; `InspectionDefinition` / `LogTemplate` as separate engines (not rewritten); `/today` Todays Work as separate product surface.

7. **Can existing Task become authoritative?** **No.** It is a projection of other sources (`sourceType`/`sourceId`), lacks Work Plan versioning, cycle applicability, responsibility modes, and would imply `TASK_SYNC_ENABLED` / engine coupling.

8. **Would reuse reactivate old assumptions?** **Yes** — dual-write, occurrence generators, Todays Work assembly, and Operations Engine paths.

9. **New DepartmentWorkPlan / WorkItem family safer?** **Yes** — mirrors Phase 9C Operational Template pattern: publish/version/retire, derived requirements, sparse events.

10. **Persist occurrences or derive?** **Derive** Work Requirements for the operational date (like Evidence Requirements).

11. **Sparse runtime state when acted on?** **Yes** — persist `DepartmentWorkOccurrence` (+ append-preserving events) only on completion, Not Required, reopen, reassignment, one-off create, offline sync conflict.

12. **Assignment-derived responsibility:** Confirmed Assignments only. Draft / unconfirmed plans never create frontline Work.

13. **Multiple Employees on one Unit:** Eligible Employees see the same Unit-shared occurrence; first valid completion satisfies it; actor recorded.

14. **Unit-shared work required?** **Yes** — primary Dietary mode (`UNIT_SHARED`).

15. **Each-Employee work required?** **Deferred structurally** — enum reserved (`EACH_ASSIGNED_EMPLOYEE`) but Phase 11A Dietary Runtime implements Unit-shared; Employee-specific one-off may target a single Employee without enabling the recurring mode.

16. **Task-level reassignment?** **Yes** — occurrence-level only; does not mutate Operational Assignment.

17. **One-off same runtime abstraction?** **Yes** — `DepartmentWorkOccurrence` with `sourceKind=ONE_OFF` (no Work Plan version).

18. **Authoritative Procedure model:** `KnowledgeArticle` (Admin Knowledge / Procedures & Resources) with `DRAFT` / `PUBLISHED` / `ARCHIVED`.

19. **Publication/version semantics:** Status-based publish/archive; **no immutable version lineage** on KnowledgeArticle today. Work Items store `knowledgeArticleId` + title snapshot at link/completion time. Full Procedure versioning is out of Phase 11A scope beyond status + snapshot.

20. **Employee Procedure viewing:** Contextual knowledge drawer/panel exists; Phase 11A adds Work-linked read-only Procedure view from Job Flow / Task detail.

21. **Historical Work Plan version:** Completions reference immutable published `DepartmentWorkPlan` id (`stableKey`+`version`) and `itemKey`.

22. **Reusable without OPERATION_ENGINE_ENABLED:** Template publish/version pattern; Evidence requirement derivation; Job Flow / Supervisor Board projections; Offline bundle + sync + idempotency; Evidence/Asset authority patterns; KnowledgeArticle publish visibility.

23. **Placeholder / legacy UI:** Wave Task projection notes on issue pages; Todays Work routes; Operations Engine diagnostics.

24. **Old routes to isolate:** Task dual-write paths; `/today` projection assemblies; Operations Engine routes; do not activate via Phase 11A flag.

25. **Smallest coherent Phase 11A architecture:**  
    `DepartmentWorkPlan` (versioned) → `DepartmentWorkItem` → derived `WorkRequirement` → sparse `DepartmentWorkOccurrence` + events → Job Flow / Supervisor Board / Offline consumers. Procedures = `KnowledgeArticle` links. Flag: `DIETARY_WORK_PLANS_ENABLED` (default false).

---

## Canonical Ownership

| Concept | Owner |
|--------|--------|
| **DepartmentWorkPlan** | Reusable Department configuration: applicability, timing rules container, publish/version/retire |
| **DepartmentWorkItem** | Expected work step within a published plan version |
| **WorkRequirement** (derived) | Expected occurrence for date + location + cycle/window + responsibility context |
| **DepartmentWorkOccurrence** | Sparse persisted state when acted on (completion, Not Required, reopen, reassignment, one-off) |
| **DepartmentWorkEvent** | Append-preserving history of occurrence actions |
| **Assignment** | Who/where/when responsibility window — not work steps |
| **Operational Cycle** | Day-phase windows — referenced, not copied |
| **Evidence** | Readings/checks/inspections — optional LINKED_EVIDENCE completion |
| **Milestone** | Servery Ready / Meal Started — independent |
| **KnowledgeArticle** | Procedure guidance — viewing ≠ completion |
| **Job Flow** | Projection only |
| **Supervisor Board** | Exception projection only |

Wave-era `Task` remains isolated. `OPERATION_ENGINE_ENABLED` and `TASK_SYNC_ENABLED` stay false for Phase 11A activation.

---

## Responsibility Decision

**Phase 11A Dietary primary mode: `UNIT_SHARED`.**

- One occurrence per Unit (and optional Space) + Work Item + operational date + cycle/window.
- Confirmed Assignment to that Unit grants eligibility.
- Optional `roleKeys` filter on Work Item.
- First valid completion satisfies the occurrence.
- `EACH_ASSIGNED_EMPLOYEE` reserved for future EVS; not Runtime-activated for recurring Dietary plans in 11A.
- One-off Work may optionally assign a specific Employee.

Draft Assignments never produce frontline Work.

---

## Persistence Decision

**Requirements are derived.** Sparse `DepartmentWorkOccurrence` rows are created on first mutation or offline sync for that identity. Stable occurrence key is deterministic from plan version + itemKey + date + location + cycle/window (+ employeeId only if EACH mode or one-off targeted).

Do not pre-generate months of future occurrences.

---

## Completion Modes

1. **EXPLICIT_CONFIRMATION** — Employee confirms; creates completion event/occurrence state.
2. **LINKED_EVIDENCE** — Accepted `OperationalEvidenceRecord` for linked template/requirement satisfies Work; no duplicate TaskCompletion truth required beyond optional audit event pointing at Evidence record id. Local pending Evidence → `SAVED_ON_THIS_TABLET`. Rejected/conflict Evidence does not complete Work.

Milestone completion is **not** a Task completion mode.

---

## Phase 10A Findings — Closure Matrix

Full matrix with exact evidence: [`DIETARY_DEPARTMENT_WORK_PLANS_PHASE_11A_2026-08-06.md`](./DIETARY_DEPARTMENT_WORK_PLANS_PHASE_11A_2026-08-06.md#phase-10a-finding-closure-matrix).

| Finding | Disposition |
|---------|-------------|
| Projected Unit Workspace Asset panels | **RETAINED WITH CLASSIFICATION** — `PROJECTION_UNIT_WORKSPACE_ENABLED` default false; not active supported Runtime |
| `/assets` Dietary quick action | **CLOSED** — Dietary `quickActionIds` / `operationsLinkIds` include `assets` |
| Quick PIN Asset Issue | **CLOSED** — browser click-through in work-plans (+ asset) gates |
| WO lifecycle UI | **CLOSED** (strengthened) — Issue→WO detail BROWSER; residual status steps SQL |
| Foreign Vendor | **RETAINED WITH CLASSIFICATION** — selector scope BROWSER; foreign-ID reject SERVICE/SQL |
| Evidence ↔ Issue deep links | **CLOSED** where product supports — both directions in asset browser when Evidence exists |

---

## Feature Activation (local)

```
DIETARY_OPERATIONAL_CYCLES_ENABLED=true
DIETARY_JOB_FLOW_ENABLED=true
DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
DIETARY_ASSET_OPERATIONS_ENABLED=true
DIETARY_WORK_PLANS_ENABLED=true
OPERATION_ENGINE_ENABLED=false
TASK_SYNC_ENABLED=false
```

---

## Explicit Non-Goals

Automatic scheduling, automatic Assignment generation, AI task generation, generic PM/Todo, Kanban/Gantt, payroll, PHI, EVS/Plant implementation, Operations Engine, Task dual-write activation, hosted staging.
