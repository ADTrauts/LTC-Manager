# EVS Reference Implementation — Phase 11B Ownership Decision

**Date:** 2026-08-07  
**Branch:** `product/evs-reference-implementation-phase-11b-2026-08-07`  
**Base tip:** `00333d191ea8df419674623f2621d313ed12f72d` (Phase 11A sequential-verification docs)  
**Phase 11A product tip:** `494f115b0543a602aeb6dc5622001f8e97108e5b`  
**Mode:** ACT — PRODUCT PHASE 11B

This document records the architecture trace and ownership decisions required before Phase 11B implementation. Implementation must not begin until these decisions are recorded in-repo.

---

## Starting verification

| Item | Value |
|------|-------|
| Phase 11A branch | `product/department-work-plans-phase-11a-2026-08-06` |
| Local / remote Phase 11A tip | `00333d191ea8df419674623f2621d313ed12f72d` (match) |
| Phase 11A product SHA | `494f115b0543a602aeb6dc5622001f8e97108e5b` |
| Phase 11A verification-doc SHA | `00333d191ea8df419674623f2621d313ed12f72d` |
| Frozen release | `80353dfcc870f4bd53de95cad3fd91d93ba5056b` (`release/dietary-v1-pilot-certified-2026-08-05`) |
| Local main | `704adc72abb46705a4451608a2fadf84215f42be` |
| origin/main | `6380b661a64e8f020d16813342945797a50bc0e0` |
| Migrations at start | 70 |
| Working tree at branch | Clean; synchronized with origin Phase 11A |
| `ltc_manager` | Untouched; disposable PG16 only |
| Cloud resources | None authorized |

---

## Architecture Trace (answers 1–25)

1. **Shared platform components already accept arbitrary Departments:** `Department` model and seed (DIETARY/EVS/PLANT); `EmployeeDepartment`; `UnitDepartmentResponsibility` / `UnitSpaceResponsibility`; `OperationalAssignment*` (department-scoped); `DepartmentOperationalCycle` (`mealType` optional); `OperationalTemplate` + Evidence; `DepartmentWorkPlan*` family; `KnowledgeArticle`; Locations / Projection; Admin Departments; assignment-role registry including EVS roles; nav keys `"DIETARY" \| "EVS" \| "PLANT"`.

2. **Hardcoded to Dietary:** `DIETARY_*_ENABLED` flags; staffing page loaders forcing `key: "DIETARY"` (work-plans, operations, cycles, templates, log-book); Unit Workspace Job Flow Dietary lookup; offline `build-runtime-bundle` Dietary-only; Work/Job Flow authority gated by Dietary flags; coverage helper named `buildDietaryCoverageSummary`; Assets/Issues nav excludes EVS today.

3. **Meal-specific — remain Dietary-only:** `MealType`, `UnitMealTime`, servery milestones, SERVICE cycles requiring mealType, Job Flow meal/milestone expectation UI, Menus module, Dietary Work/Evidence presets.

4. **Can be generalized safely:** Work Plan publish/version/derive/sparse occurrence; Evidence space applicability; Operational Cycles as labeled facility-local windows with null mealType; Assignment confirm + unit/role coverage; offline command/idempotency patterns; authority patterns once flag+department keyed; KnowledgeArticle Work links; Locations tree ROOM = UnitSpace.

5. **Remain Department-specific views over shared services:** Dietary Job Flow / Board meal language; EVS Job Flow / Board room-round language; Dietary menus/servery; EVS readiness presentation (`evs-room-signals`); Plant Assets ownership; Experience Area catalogs (already department-keyed).

6. **Assignment room / UnitSpace responsibility:** **No.** `OperationalAssignment` targets `unitId` only. Room responsibility exists on `UnitSpaceResponsibility` but is not Assignment-wired.

7. **Work applicability room-level execution:** Schema supports `SPECIFIC_SPACE` / `SPACE_TYPE` and occurrence `spaceId`. Phase 11A Runtime `resolveWorkRequirements` only honors Unit applicabilities and does not expand space kinds — **logic patch required**, not a new model.

8. **Supervisor coverage location grouping:** Unit-grain only (`unitId` × role). No space/zone grouping today.

9. **Named EVS work-zone concept:** **No** first-class entity. Closest: `UnitType.EVS_ZONE` (Unit classification) and Experience “Areas”. Legacy `/evs` board removed.

10. **New reusable Department Zone model justified?** **Not for Phase 11B.** Hierarchy + Unit/Space responsibilities + Work/Evidence `spaceId` suffice.

11. **EVS without zones in Phase 11B?** **Yes.** Assign to Units; execute at UnitSpace; summarize by Unit / space list. Defer named zones.

12. **Rooms in Facility Builder and Runtime:** Rooms are `UnitSpace` under Units; Locations tree kind `"ROOM"` with `physicalId` = SPACE id; classic Runtime is `/unit/[unitId]`.

13. **Room vs UnitSpace:** Same canonical physical concept — product “Room” = `UnitSpace`. Separate legacy: `RoomAreaStatus` (Unit-dated readiness signal, not per-space Work authority).

14. **Authoritative for room-level operational work:** **`UnitSpace` + Work/Evidence `spaceId`.** Do not dual-write completion into `RoomAreaStatus`.

15. **Previous EVS code isolation:** Keep EVS Department seed, roles, Experiences, readiness as readiness-only. Do not reactivate dead `/evs` board or Wave Task dual-write.

16. **EVS Employee after Quick PIN:** Same path as Dietary — PIN → `/unit/{unitId}` Job Flow parameterized for EVS. No Build / Supervisor via PIN.

17. **Room/space summary without competing state:** Derive from Work Requirements + sparse occurrences + Evidence + offline pending/conflict + Assignment. Aggregate by `spaceId` / Unit. `RoomAreaStatus` optional readiness display only.

18. **Inspections relate to Work:** `OperationalTemplatePurposeType.INSPECTION` is Evidence. Work may use `LINKED_EVIDENCE`. Viewing Procedure ≠ completion. Legacy InspectionDefinition isolated.

19. **Rework representation:** Separate one-off / reopened Work occurrence; preserve original Evidence; do not mutate inspection to Pass when rework completes; follow-up inspection is a new record.

20. **Assets without Plant Operations:** Thin scoped Issue reporting / operational status for EVS-relevant equipment via shared Asset system; do not grant Plant WO management; do not auto-route to Plant unless already configured.

21. **Procedures reusable:** `KnowledgeArticle` with EVS `departmentId` (or facility-wide null); Work Item `knowledgeArticleId` + title snapshot.

22. **Must change without breaking Dietary:** New `EVS_OPERATIONS_ENABLED` (do not flip Dietary flags); parameterize loaders; expand space Work resolve; EVS Job Flow / Board composition without meals; nav opens EVS operational routes carefully; offline department-keyed; Dietary pages remain behind `DIETARY_*`.

23. **Generic components to extract:** Department-keyed page bootstrap; Work resolve space expansion; cycle window resolve (already mostly generic); coverage summary generalization; offline bundle department injection; authority helpers by flag + department.

24. **Remain Dietary-specific:** Meal targets, servery milestones, menus, Dietary presets, `DIETARY_*` flag names, Dietary pilot gates, servery meal panels.

25. **Smallest coherent EVS implementation:** Flag `EVS_OPERATIONS_ENABLED` → EVS Cycles (null mealType) → EVS Work Plans with Unit + SpaceType/Specific Space → Job Flow on `/unit/{id}` → Supervisor `/staffing/operations` EVS projection → Evidence INSPECTION + one-off rework → Procedures via Knowledge → thin Asset Issue → offline EVS Work/Evidence. **No** Zone model, **no** `/evs` board revival, **no** Operations Engine / Task sync, **no** competing room cleaningStatus.

---

## Zone Decision

**DEFER — no Department Zone model in Phase 11B.**

Named groups (Floor 1, East Wing) are satisfied operationally by:

- Existing Floor → Unit → UnitSpace hierarchy
- Supervisor filters by Floor / Unit
- Optional `UnitType.EVS_ZONE` Units when Facility Builder already uses them

A Zone must not replace location responsibility or become an authorization boundary. Revisit in a later phase only if named Supervisor scopes are proven necessary beyond Floor/Unit filters.

---

## Start / In-Progress Decision

Phase 11A has **no** explicit Work “Start” event. Phase 11B will **not** add a Start event or mutable `room.cleaningStatus`.

Room / Space **IN_PROGRESS** is **derived** when:

- At least one required Work Requirement for that space is COMPLETED (or COMPLETED_WITH_EVIDENCE / NOT_REQUIRED), and
- At least one other required Work Requirement remains incomplete (CURRENT / DUE / PAST_DUE_NOT_CONFIRMED / SAVED_ON_THIS_TABLET / etc.)

No competing source of truth.

---

## Feature Activation

**Flag:** `EVS_OPERATIONS_ENABLED` (default `false`)

When enabled for local / test use, EVS may use Cycles, Job Flow, Evidence, Work Plans, and thin Asset Issue paths for the EVS Department. Dietary remains gated by existing `DIETARY_*` flags independently.

Does **not** enable `OPERATION_ENGINE_ENABLED` or `TASK_SYNC_ENABLED`.

Typical local activation:

```
EVS_OPERATIONS_ENABLED=true
OPERATION_ENGINE_ENABLED=false
TASK_SYNC_ENABLED=false
```

Dietary pilot activation remains unchanged (existing `DIETARY_*` set).

---

## Canonical Ownership

| Concept | Owner |
|--------|--------|
| Physical structure (Floor / Unit / Room=UnitSpace) | Facility Builder |
| Which locations EVS operates in | Department location responsibility |
| Who / where / when | OperationalAssignment (Unit grain in 11B) |
| Day phases | DepartmentOperationalCycle (null mealType for EVS) |
| Recurring work configuration | DepartmentWorkPlan / WorkItem |
| Completion / Not Required / Reopen / one-off | DepartmentWorkOccurrence + events |
| Procedures | KnowledgeArticle |
| Inspections / checks | OperationalTemplate + Evidence records |
| Job Flow / Supervisor Board | Derived projections only |
| Assets / Issues | Shared Asset system |
| Room / Space summary | Derived from Work + Evidence + offline + Assignment |
| Named Zone | Deferred — not introduced |

Wave-era `Task` remains isolated. Do not create `EVSAssignment`, EVS Task engine, EVS Evidence models, or duplicate Room tables.

---

## Schema Decision

**Prefer zero migrations for Phase 11B.**

- Assignment remains Unit-level.
- Room work via UnitSpace expansion in Work resolve + occurrence `spaceId`.
- No `DepartmentZone` table.
- Optional future: `OperationalAssignment.unitSpaceId` — out of 11B unless Runtime proves Unit-only insufficient after space expansion.

---

## Route Decision

**Reuse `/staffing/*` and `/unit/[unitId]`** with active-department resolution (same pattern as Assignments). Do not revive `/evs` board routes.

---

## Dietary Isolation Rule

- Enabling EVS must not change Dietary Runtime when Dietary flags are off.
- Dietary Work must not appear to EVS Staff and vice versa.
- Cross-Department / cross-Facility IDs fail closed.
- Existing Dietary browser gates must remain green.

---

## Retained Cross-Phase Findings

1. Projected Unit Workspace does not contain the classic Asset panels.
2. Foreign Vendor arbitrary-ID rejection remains verified at service / SQL boundary while the normal browser selector is Facility scoped.

Not Phase 11B blockers. Retain unless naturally touched.

---

## Out of scope (explicit)

Plant Operations; clinical workflows; resident identity / PHI; ADT; automatic scheduling / Assignment generation; AI routing; inventory / purchasing; infection-control certification; hosted staging; production deployment; real Employee data; Operations Engine; Task sync.
