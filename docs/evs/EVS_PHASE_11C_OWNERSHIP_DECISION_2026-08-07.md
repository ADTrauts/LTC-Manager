# EVS Assignment Scope — Phase 11C Ownership Decision

**Date:** 2026-08-07  
**Branch:** `product/evs-assignment-zones-scale-phase-11c-2026-08-07`  
**Base tip:** `0c500dca1a0565b2fc8f200249b46938561ea5be` (Phase 11B)  
**Mode:** ACT — PRODUCT PHASE 11C

Implementation must follow these locked decisions. Do not invent a second Assignment system or a second Room model.

---

## Starting verification

| Item | Value |
|------|-------|
| Phase 11B branch | `product/evs-reference-implementation-phase-11b-2026-08-07` |
| Local / remote Phase 11B tip | `0c500dca1a0565b2fc8f200249b46938561ea5be` (match) |
| Frozen release | `80353dfcc870f4bd53de95cad3fd91d93ba5056b` |
| Local main | `704adc72abb46705a4451608a2fadf84215f42be` |
| origin/main | `6380b661a64e8f020d16813342945797a50bc0e0` |
| Migrations at start | 70 |
| Working tree at branch | Clean |
| Baseline | `verify:static` / `test:hermetic` / `verify:build` green |
| `ltc_manager` | Untouched |
| Cloud | None |
| `OPERATION_ENGINE_ENABLED` | false |
| `TASK_SYNC_ENABLED` | false |

---

## Assignment Architecture Trace (answers 1–15)

1. **Can OperationalAssignment safely support UnitSpace directly?**  
   Yes as an additive extension, but a single nullable `unitSpaceId` cannot express multi-room scopes (Rooms 101–110) without N Assignment rows. Prefer a join for multi-select.

2. **Would Unit + optional UnitSpace preserve Dietary?**  
   Yes — Dietary continues to write `unitId` only with **zero** location rows. Readers treat empty location sets as unit-wide.

3. **One location vs location set?**  
   One Assignment may cover a **set of Rooms/Spaces** for EVS operational practicality. Identity remains the Assignment row; locations are child rows.

4. **Is a separate AssignmentLocation join safer?**  
   **Yes** for multi-room EVS. Safer than opaque JSON; preserves relational integrity, overlap detection, and offline scoping without N identical Assignment shells.

5. **Historical Assignment identity?**  
   Stable `OperationalAssignment.id`. Location changes append events and replace location rows only on explicit edit of current/future rows. Completed/cancelled rows keep their snapshot. Zone membership edits never rewrite Assignment locations.

6. **Overlap checks?**  
   Employee-time overlap remains authoritative (unchanged). EVS adds **location-time** detection: same `unitSpaceId`, overlapping windows, PLANNED/ACTIVE → soft warning on board and hard reject on create/edit when both sides have explicit space rows or when a unit-wide Assignment overlaps a space Assignment under that Unit.

7. **Unit-only Dietary unchanged?**  
   No location rows; coverage stays role × optional unit; Job Flow area = unit; offline context remains unit-first.

8. **Offline assignmentContext?**  
   Additive: `scopeKind`, `locationCount`, `assignedLocations[]` (id + label only for assigned spaces), optional `sourceZoneName`. Bundle includes only assigned spaces — never the full Facility EVS catalog.

9. **Job Flow Room/Space selection?**  
   Resolve assigned location set from Assignment. Filter Work / space summaries to that set (unit-wide = all spaces under unit). Deterministic next = hierarchy / room sortOrder / priority / due — **not** route optimization.

10. **Temporary Room coverage?**  
    New Assignment (`CALL_OFF_REPLACEMENT` / `COVERAGE` / `REASSIGNMENT`) with explicit window + location snapshot. Original Assignment remains historically. Completions stay attributed to original actors. Offline stale revision conflicts.

11. **Direct Assignment vs Zone-derived responsibility?**  
    **Direct Assignment** is authoritative. Zone is convenience for selection + Supervisor filter only.

12. **Unassigned Rooms?**  
    Derived: EVS-required UnitSpaces with no covering active Assignment for the operational date/window.

13. **Overlapping responsibility?**  
    Derived: same space covered by ≥2 active Assignments with overlapping windows.

14. **Smallest safe schema change?**  
    Additive: `DepartmentOperationalZone` + `DepartmentOperationalZoneLocation` + `OperationalAssignmentLocation` + optional `OperationalAssignment.sourceZoneId`.

15. **Is schema change required?**  
    **Yes** — Phase 11C product outcome requires Room/Space responsibility windows and multi-room scopes at realistic scale. Unit-only Assignment is insufficient.

---

## Room / Space Assignment Decision

| Scope | Representation |
|-------|----------------|
| Dietary / EVS whole Unit | `unitId` set; **zero** `OperationalAssignmentLocation` rows |
| EVS selected Rooms/Spaces | One Assignment + N `OperationalAssignmentLocation` rows (`unitSpaceId` + denormalized `unitId` + `labelSnapshot`) |
| Zone convenience | Supervisor selects Zone → form preselects current members → confirm **snapshots** into AssignmentLocation; `sourceZoneId` audit only |

Canonical Room remains `UnitSpace`. No `EVSAssignment`. No JSON room-ID bags.

---

## Zone Decision

**IMPLEMENT** — justified for Phase 11C Supervisor scale (Floor 1 East / West / Public Areas).

A Department Zone is:

- Facility scoped, Department owned, named
- Grouping of existing `UnitSpace` locations
- Convenience for Assignment builder + Supervisor filters + coverage summaries
- **Not** a physical location, authorization boundary, Assignment, Work Plan, or Employee group

Lifecycle: `DRAFT` → `ACTIVE` → `RETIRED`. Retire preserves identity. Zone membership changes do **not** rewrite existing Assignments.

---

## Coverage Decision

Dietary role×unit coverage (`buildDietaryCoverageSummary`) remains.

EVS adds location coverage projection with neutral states:

`COVERED | AT_RISK | UNCOVERED | OVERLAPPING | NOT_REQUIRED | NOT_CONFIGURED`

Assignment coverage ≠ Work completion. Incomplete Work does not make a Room UNCOVERED.

---

## Sequencing Decision

Deterministic presentation only: Facility hierarchy, Unit, Room `sortOrder` / room number, Work Plan sequence, priority, due time, urgent one-off.

Explicit non-claim: **not** optimal route, walking distance, or AI ranking.

---

## Feature Activation

Reuse `EVS_OPERATIONS_ENABLED`. No new Room-Assignment flag.
Keep `OPERATION_ENGINE_ENABLED=false` and `TASK_SYNC_ENABLED=false`.
