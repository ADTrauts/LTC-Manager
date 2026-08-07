# EVS Reference Implementation — Phase 11B

**Date:** 2026-08-07  
**Branch:** `product/evs-reference-implementation-phase-11b-2026-08-07`  
**Base:** Phase 11A tip `00333d191ea8df419674623f2621d313ed12f72d`  
**Mode:** ACT — PRODUCT PHASE 11B

Companion ownership decision: [`EVS_PHASE_11B_OWNERSHIP_DECISION_2026-08-07.md`](./EVS_PHASE_11B_OWNERSHIP_DECISION_2026-08-07.md)

Guides: [Manager](./EVS_MANAGER_SETUP_GUIDE.md) · [Employee](./EVS_EMPLOYEE_GUIDE.md) · [Supervisor](./EVS_SUPERVISOR_GUIDE.md)

---

## Purpose

Prove that LTC Manager can support a second operational Department (EVS — Environmental Services) using the platform architecture established through Phase 11A, without duplicating Dietary product models or creating parallel EVS source-of-truth tables.

---

## Starting State

| Item | Value |
|------|-------|
| Phase 11A branch | `product/department-work-plans-phase-11a-2026-08-06` |
| Local / remote Phase 11A tip | `00333d191ea8df419674623f2621d313ed12f72d` |
| Phase 11A product SHA | `494f115b0543a602aeb6dc5622001f8e97108e5b` |
| Phase 11A verification-doc SHA | `00333d191ea8df419674623f2621d313ed12f72d` |
| Frozen release | `80353dfcc870f4bd53de95cad3fd91d93ba5056b` |
| Local main | `704adc72abb46705a4451608a2fadf84215f42be` |
| origin/main | `6380b661a64e8f020d16813342945797a50bc0e0` |
| Migrations | **70** (unchanged — no Phase 11B migration) |
| `ltc_manager` | Untouched |
| Cloud | None |
| `OPERATION_ENGINE_ENABLED` | false |
| `TASK_SYNC_ENABLED` | false |

---

## Architecture Trace Summary

See ownership decision for all 25 answers. Highlights:

- Shared rails already accept arbitrary Departments (Work Plans, Cycles, Evidence, Assignments, Knowledge).
- Hard Dietary locks were flags, page loaders (`key: "DIETARY"`), meal/milestone Job Flow, and offline Dietary-only bundle.
- Room = `UnitSpace`. Authoritative room Work uses `spaceId` on Work/Evidence — not `RoomAreaStatus`.
- Assignment remains Unit-grain; room Work via space applicability expansion.
- Legacy `/evs` board stays deferred.

---

## Multi-Department Generalization Decisions

| Change | Decision |
|--------|----------|
| Feature flag | New `EVS_OPERATIONS_ENABLED` (umbrella). Do **not** reuse `DIETARY_*`. |
| Staffing pages | Resolve active DIETARY\|EVS via `resolveStaffingOperationalDepartment({ feature })`. |
| Work resolve | Expand `SPECIFIC_SPACE` / `SPACE_TYPE` into per-space requirements. |
| Job Flow / Board | Soft-skip meal/servery when department is EVS. |
| Offline bundle | Department-keyed; EVS skips servery milestones. |
| Authority | Department-generic messages; flag from department key. |
| Presets | Dietary presets remain Dietary; EVS presets separate (`ROUTINE_ROOM_CLEAN`, etc.). |
| Nav Assets/Issues | EVS allowed for thin Issue reporting. |
| Routes | Reuse `/staffing/*` and `/unit/[unitId]` — do not revive `/evs`. |
| Package rename | `dietary-job-flow/` kept; not renamed for aesthetics. |

---

## Canonical Ownership

Unchanged from Phase 11A ownership model, applied to EVS:

Facility Builder owns structure → Department responsibility owns EVS locations → Assignment owns who/where/when → Cycles own day phases → Work Plans own recurring work → Occurrences own completion state → Procedures = KnowledgeArticle → Evidence owns inspections → Job Flow / Supervisor Board are projections → Assets/Issues are shared.

No `EVSAssignment`, EVS Task engine, EVS Evidence models, or duplicate Room tables.

---

## Location Model

EVS operates against Facility-defined Floors → Units/Neighborhoods → Rooms/Spaces (`UnitSpace`).

Manager includes/excludes locations via Department responsibility and Work Plan applicability (`DEPARTMENT_UNIT`, `SPECIFIC_UNIT`, `SPACE_TYPE`, `SPECIFIC_SPACE`). Moving a Room between Departments does not rewrite historical Work/Evidence.

---

## Zone Decision

**Deferred.** No `DepartmentZone` model in Phase 11B.

Supervisor filters use Floor / Unit. `UnitType.EVS_ZONE` remains a Facility Builder Unit classification only — not a new authorization or Assignment boundary.

---

## Assignment Model

Reuse `OperationalAssignment` (Unit-level). EVS Employees are assigned to Units; room Work appears via Work applicability expansion across UnitSpaces. No automatic Assignment generation. Draft Assignments never produce frontline Work.

---

## Operational Cycles

Reuse `DepartmentOperationalCycle`. EVS defaults (`buildEvsDefaultCyclePlans`) are Draft-only examples without `mealType` / servery milestones: Morning Routine, Day Cleaning, Afternoon Round, Evening Cleaning, Shift Closeout. Facility-local time remains authoritative. Dietary cycle behavior unchanged.

---

## EVS Work Plans

Draft presets (never auto-published):

1. **ROUTINE_ROOM_CLEAN** — `SPACE_TYPE` PATIENT_ROOM  
2. **COMMON_AREA_ROUND** — PUBLIC_AREA / RESTROOM  
3. **SHIFT_CLOSEOUT** — DEPARTMENT_UNIT  
4. **ROOM_TURN_SPECIAL_CLEAN** — SPECIFIC_SPACE oriented Draft for manual/special cleans (no ADT / resident identity)

---

## Room / Space Summary

Derived via `deriveSpaceWorkSummary` from Work Requirements (+ Needs Review / Rework markers). States include UPCOMING, WORK_DUE, IN_PROGRESS, WORK_COMPLETE, NEEDS_REVIEW, REWORK_REQUIRED, PAST_DUE_NOT_CONFIRMED, NOT_REQUIRED, NOT_APPLICABLE, NOT_CONFIGURED, SAVED_ON_THIS_TABLET, CONFLICT_REVIEW.

**WORK_COMPLETE** means configured EVS Work requirements are confirmed complete. It is **not** a clinical, infection-control, or “safe for occupancy” claim.

No mutable `room.cleaningStatus`. No Start event added; IN_PROGRESS is derived.

---

## Employee Job Flow

Reuse shared Job Flow. EVS composition emphasizes Current Area / Current Work / Next / Procedure / Evidence / Attention / Progress counts (factual location counts, not performance scores). Quick PIN lands on `/unit/{unitId}`. Meal milestones hidden for EVS.

---

## Inspection and Rework

Reuse `OperationalTemplate` INSPECTION. Needs Attention preserves Evidence; surfaces Needs Review; Supervisor creates separate one-off rework; completing rework does **not** rewrite inspection to Pass; follow-up inspection is a new record.

---

## Procedures

`KnowledgeArticle` with EVS department ownership (or facility-wide). Viewing ≠ Work completion. Synthetic content only — not clinical infection-control policy.

---

## One-Off Work

Phase 11A one-off Work reused (spill, extra service, rework, supply restock). Supervisor creates for location / optional Employee / priority / window / Procedure / optional Asset.

---

## Supervisor Operations

EVS projection on `/staffing/operations`: staffing/coverage, current work exceptions, quality/inspection Needs Review, offline conflicts, asset issues, missing configuration. Source actions only — no board-specific bypass mutations.

---

## Assets and Issues

Shared Asset system. EVS may view operational status and report Issues. Phase 11B does not implement Plant Operations or auto-route repairs to Plant unless already configured.

---

## Log Book / History

Reuse Log Book with Department = EVS filters. Historical records retain original Work Plan / Template versions, location, actor, times. Configuration changes do not rewrite history.

---

## Offline Runtime

Reuse Phase 11A Work + Phase 9C Evidence offline. Bundle is department-keyed for authenticated Employee + device + Assignment scope. Exactly-once sync, user isolation, location rebind isolation, conflict on stale reassignment. No offline Build / Supervisor management.

---

## Authority

| Role | EVS capability |
|------|----------------|
| STAFF / LEAD | Own Job Flow, complete Work/Evidence, Procedures, scoped Issue report. No Build / Supervisor Board. |
| SUPERVISOR | Operations Board, one-off, reassign, Not Required, reopen, inspections per config. |
| MANAGER | Work Plans, Cycles, Templates, Procedures, history. |
| FA alone | Denied without EVS operational relationship. |
| Quick PIN | Frontline Runtime only. |

Cross-Facility / cross-Department fail closed.

---

## Feature Activation

```
EVS_OPERATIONS_ENABLED=true
OPERATION_ENGINE_ENABLED=false
TASK_SYNC_ENABLED=false
```

Default: `EVS_OPERATIONS_ENABLED=false`. Dietary remains on independent `DIETARY_*` flags. Enabling EVS does not enable Operations Engine or Task sync.

---

## Database / Migrations

**Zero migrations in Phase 11B.** Migration count remains **70**. Empty-database migrate deploy + seed remain valid.

---

## Synthetic EVS Pilot

Browser/SQL fixtures: EVS Department, multiple Units, ≥8 PATIENT_ROOM spaces (scale note: full 40–60 room optional), synthetic Employees (manager/supervisor/staff/dietary/FA), published cycles without mealType, Work Plan with SPACE_TYPE, Assignment, Inspection template, Procedure, Asset. No real names, no resident PHI, no committed credentials.

---

## Performance

Relational batching via existing `resolveUnitWorkRequirements` / Job Flow / Supervisor loaders. No Redis. No microservices. Avoid N+1 room queries by expanding spaces in one resolve pass.

---

## Retained Cross-Phase Findings

1. Projected Unit Workspace does not contain the classic Asset panels.  
2. Foreign Vendor arbitrary-ID rejection remains verified at service / SQL boundary while the normal browser selector is Facility scoped.

---

## Explicitly Not Implemented

- Plant Operations  
- Clinical workflows / resident care / PHI  
- ADT / automatic discharge feeds  
- Automatic scheduling / Assignment generation  
- AI routing / optimization engine  
- Payroll / inventory / linen / chemical / purchasing  
- Vendor portal  
- Preventive maintenance as Plant product  
- Full QMS / infection-control certification claims  
- Hosted staging / production deployment  
- Real Employee data  
- Named Department Zone model  
- Operations Engine / Task sync  

---

## Known Limitations

- Assignment remains Unit-level (no `unitSpaceId` yet).  
- Space progress UI may show truncated IDs until names are fully loaded in all surfaces.  
- Offline EVS does not introduce a separate non-servery device-auth product beyond department-keyed bundles.  
- ~40–60 room synthetic scale is documented; CI fixture uses a practical subset (≥8 rooms) for gate runtime.  
- Zone filters deferred.  

---

## Phase 11C Boundary (suggested)

- Optional `OperationalAssignment.unitSpaceId` if room-level responsibility windows are required.  
- Named Department Zone model if Floor/Unit filters prove insufficient.  
- Richer EVS Supervisor zone selection UX.  
- Deeper Plant ↔ EVS Issue routing productization.  
- Larger-scale performance certification (40–60+ rooms in CI).  
- Plant Operations reference implementation (separate phase).  

---

## Certification Recommendation

See final validation matrix in the phase closeout report. Phase 11B may pass only when EVS uses canonical locations + shared rails, Dietary remains green, history is preserved, offline is scoped/idempotent, and engine flags stay off.
