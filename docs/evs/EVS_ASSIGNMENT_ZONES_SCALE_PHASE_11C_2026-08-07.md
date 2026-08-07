# EVS Assignment Scope, Zones, and Operational Scale — Phase 11C

**Date:** 2026-08-07  
**Branch:** `product/evs-assignment-zones-scale-phase-11c-2026-08-07`  
**Base tip:** `0c500dca1a0565b2fc8f200249b46938561ea5be` (Phase 11B)  
**Ownership decision:** [`EVS_PHASE_11C_OWNERSHIP_DECISION_2026-08-07.md`](./EVS_PHASE_11C_OWNERSHIP_DECISION_2026-08-07.md)

---

## Product outcome

An EVS Supervisor can divide multi-floor Rooms / Spaces among Employees, see coverage and exceptions at 40–60 Room scale, and change temporary coverage without inventing an EVS-specific Assignment system or a second Room model.

Canonical chain:

Facility Locations → Department responsibility → optional Zone → confirmed OperationalAssignment (+ location snapshot) → Room/Space Work → Employee Job Flow → Supervisor Operations

---

## Assignment architecture decision

| Decision | Choice |
|----------|--------|
| System | Shared `OperationalAssignment` only — **no** `EVSAssignment` |
| Room model | Canonical `UnitSpace` only |
| Multi-room scope | `OperationalAssignmentLocation` join (snapshotted) |
| Unit-wide (Dietary / EVS whole Unit) | `unitId` set; **zero** location rows |
| Zone reference | Optional `sourceZoneId` audit only — not live membership |
| History | Stable Assignment id + events; Zone edits never rewrite locations |
| Overlap | Employee-time overlap unchanged; EVS adds location-time reject on write |
| Route optimization | **Not implemented** — deterministic presentation only |

---

## Zone decision

**Implemented.** Department Zones are Facility + Department owned named groupings of `UnitSpace` locations.

Zones support Assignment convenience, Supervisor filters, and coverage summaries.

Zones are **not** physical locations, authorization, Assignments, Work Plans, or Employee groups.

Lifecycle: `DRAFT` → `ACTIVE` → `RETIRED`.

---

## Coverage

Dietary role×unit coverage remains (`buildDietaryCoverageSummary`).

EVS location coverage (`buildLocationCoverageSummary`) states:

`COVERED | AT_RISK | UNCOVERED | OVERLAPPING | NOT_REQUIRED | NOT_CONFIGURED`

Assignment coverage is independent of Work completion.

---

## Employee scope and sequencing

Job Flow shows Assigned Area / Assigned Rooms summary, expandable location list, NOW / NEXT / QUEUE.

Ordering inputs: hierarchy, Unit, Room sortOrder / number, Work Plan sequence, priority, due time, urgent one-off.

**Explicit non-claim:** this is not an optimized walking route and does not use AI.

---

## Temporary coverage

Use certified Assignment create with `CALL_OFF_REPLACEMENT` / `COVERAGE` / `REASSIGNMENT`, explicit window, and location snapshot.

Original Assignment remains historically. Completions stay attributed to original actors. Offline stale revision conflicts safely.

---

## Offline scope

Bundle includes only assigned Rooms / Spaces when scope is `SPACES`. Full Facility EVS catalog is never cached for a 10-Room Assignment.

Assignment revision token includes location count for stale detection.

---

## Authority

Unchanged role rules. Zone membership does not grant authority. Assignment scope does not override Department / Facility authorization.

FA alone: no EVS operational authority. Quick PIN: Frontline Runtime only.

---

## Feature activation

Reuse `EVS_OPERATIONS_ENABLED`.

Keep `OPERATION_ENGINE_ENABLED=false` and `TASK_SYNC_ENABLED=false`.

---

## Database

Migration `20260807120000_evs_assignment_zones_scale_phase_11c` (additive):

- `DepartmentOperationalZone`
- `DepartmentOperationalZoneLocation`
- `OperationalAssignmentLocation`
- `OperationalAssignment.sourceZoneId`

Preserves Dietary and Phase 11B EVS Assignments. Migration count: **71**.

Never writes `ltc_manager`.

---

## Scale fixture

`scripts/verify/evs-assignment-browser-fixtures.mjs`:

- 4 Floors, multiple Units, 40–60 Rooms
- 15–25 EVS Employees, ≥2 Supervisors
- Zones, under-coverage + overlap hooks, offline staff, Work Plans, inspection, asset

Synthetic only — no PHI.

---

## Browser gate

```bash
npm run test:evs-assignment-browser
```

Disposable PostgreSQL 16 via `VERIFY_DATABASE_URL` (+ `VERIFY_MANAGE_DATABASE=1` when recreating).

---

## Dietary / EVS regression

Dietary Unit Assignments remain zero-location-row. Dietary gates remain required green.

Phase 11B EVS gates remain required green.

---

## Retained findings

| # | Finding | Phase 11C disposition |
|---|---------|------------------------|
| 1 | Unit-only Assignment | **Addressed** — Room/Space location join |
| 2 | Named Zones deferred | **Addressed** — Department Zone model |
| 3 | ~8 Room fixture | **Addressed** — 40–60 Room scale fixture |
| 4 | Partial browser scenarios | Partially addressed; honest labels remain for SQL/prior-gate rows |
| 5 | Truncated Room IDs in UI | **Addressed** where practical — friendly labels |
| 6 | Projected Unit Workspace Asset panels | Retained (unrelated) |
| 7 | Foreign Vendor arbitrary-ID rejection | Retained (unrelated) |

---

## Plant Operations boundary

Phase 11C does not implement Plant Operations. Thin Asset Issue paths remain shared. No Plant WO management grant. No Operations Engine / Task sync activation.

---

## Certification recommendation

Recorded in the Phase 11C final report after sequential validation.
