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

## FINAL SEQUENTIAL CERTIFICATION

**Sequential verification date:** 2026-08-07  
**Branch:** `product/evs-assignment-zones-scale-phase-11c-2026-08-07`

### Authoritative tips (pre-certification product tip)

| Tip | SHA |
|-----|-----|
| Expected Phase 11C product tip (seven feature/docs commits) | `49a38113f1bd8faf241bdd09d0a3f0dedfc4c779` |
| Local = remote at start of sequential verification | Identical at `49a38113…` |
| Commit / push ambiguity | **Resolved.** Prior “no commits or pushes” wording came from subagent task handoffs only. The seven Phase 11C commits (`a5a7100` … `49a3811`) existed on local and `origin` before this certification run. |

Post-certification tip (this docs commit + typecheck fix) supersedes `49a38113` on the same branch; see git log.

### Sequential command results

Gates run **one at a time** on disposable PostgreSQL 16 (`ltc-pg16-verify` `:5433`). `ltc_manager` untouched. No cloud resources.

| # | Command | Result | Notes |
|---|---------|--------|-------|
| 1 | `env -u NODE_ENV npm run verify:static` | **PASS** | First attempt failed on duplicate `faWithEvsEmail` type; fixed; isolated re-run PASS. Migrations=71. |
| 2 | `env -u NODE_ENV npm run test:hermetic` | **PASS** | `# tests 1551` / `# pass 1461` / `# fail 0` / `# skipped 90` |
| 3 | `env -u NODE_ENV npm run verify:build` | **PASS** | First attempt blocked by stale Next build lock (env contention); isolated re-run PASS. |
| 4 | `env -u NODE_ENV npm run verify:db` | **PASS** | Migrations=**71**; `# pass 1551` / `# fail 0`. First two attempts failed when shell inherited `EVS_OPERATIONS_ENABLED=true` (offline Dietary authority test FK); clean re-run with `EVS_OPERATIONS_ENABLED=false` PASS; disposable DB dropped. |
| 5 | `npm run test:assignment-browser` | **PASS** | 6 passed |
| 6 | `npm run test:offline-browser` | **PASS** | 25 passed |
| 7 | `npm run test:dietary-pilot` | **PASS** | 5 passed |
| 8 | `npm run test:operational-cycles-browser` | **PASS** | 6 passed |
| 9 | `npm run test:job-flow-browser` | **PASS** | 13 passed |
| 10 | `npm run test:operational-evidence-browser` | **PASS** | 10 passed |
| 11 | `npm run test:asset-operations-browser` | **PASS** | 1 passed |
| 12 | `npm run test:work-plans-browser` | **PASS** | 1 passed (built `.next-workplans-browser`) |
| 13 | `npm run test:evs-browser` | **PASS** | 9 passed (`EVS_OPERATIONS_ENABLED=true` for fixture) |
| 14 | `npm run test:evs-assignment-browser` | **PASS** | 10 passed (`EVS_OPERATIONS_ENABLED=true` for fixture) |

**Flags during certification:** `OPERATION_ENGINE_ENABLED=false`, `TASK_SYNC_ENABLED=false`. `EVS_OPERATIONS_ENABLED` false except EVS browser fixtures.

### Phase 11C browser matrix (honest classification)

| Scenario | Classification |
|----------|----------------|
| 01 Scale fixture 40–60 rooms / ≥15 EVS employees | **BROWSER PASS** (fixture asserts in gate) |
| 02 Assignment Board space picker + zone manager | **BROWSER PASS** |
| 03 Multi-room snapshotted friendly labels | **BROWSER PASS** (+ SQL snapshot assert) |
| 04 Employee Job Flow assigned Room scope | **BROWSER PASS** |
| 05 Supervisor Operations filters + unassigned coverage | **BROWSER PASS** |
| 06 Offline bundle scopes assigned Rooms only | **BROWSER PASS** |
| 07 Temporary coverage preserves original history | **SQL PASS — BROWSER NOT TESTED** |
| 08 Dietary Assignment Board regression smoke | **BROWSER PASS** |
| 09 Cross-Facility Room ID rejected | **SQL PASS — BROWSER NOT TESTED** |
| 10 Zone membership change does not rewrite Assignment locations | **SQL PASS — BROWSER NOT TESTED** |
| Sequencing non-optimization / hermetic helpers | **HERMETIC PASS — BROWSER NOT TESTED** (covered in `phase-11c-assignment-zones.test.ts` hermetic cases) |
| Full create-via-UI every Zone CRUD path | **NOT TESTED** beyond board visibility + SQL membership immutability |

Do not promote SQL/service rows to browser evidence.

### Phase 11C invariants

| # | Invariant | Status |
|---|-----------|--------|
| 1 | Dietary Unit Assignments: `unitId` + zero `OperationalAssignmentLocation` rows | Verified (architecture + dietary pilot / SQL suites) |
| 2 | EVS SPACES scope resolves only selected Room / UnitSpace locations | Verified (browser 04/06 + location-scope) |
| 3 | Zone membership is not authorization | Verified (docs + authority paths unchanged) |
| 4 | Zone membership changes do not mutate historical Assignments | Verified (SQL scenario 10) |
| 5 | `sourceZoneId` is historical/audit context only | Verified |
| 6 | Assignment coverage independent of Work completion | Verified (coverage model + ops UI) |
| 7 | Temporary coverage preserves original Assignment history | Verified (SQL scenario 07) |
| 8 | Offline pending Work never retargeted after Assignment scope changes | Verified (offline + assignment revision patterns; prior offline gate) |
| 9 | Employee Job Flow does not expose unrelated Rooms | Verified (browser 04) |
| 10 | No mutable `room.cleaningStatus` | Verified (absent from schema) |
| 11 | No `EVSAssignment` model | Verified (absent from schema) |
| 12 | `OPERATION_ENGINE_ENABLED=false` | Verified |
| 13 | `TASK_SYNC_ENABLED=false` | Verified |
| 14 | Migration count = 71 | Verified (`verify:static` / `verify:db`) |
| 15 | `ltc_manager` untouched | Verified (no `ltc_manager` DB on verify PG16; disposable only) |

### Retained findings

| # | Finding | Disposition |
|---|---------|-------------|
| 6 | Projected Unit Workspace Asset panels | **Retained** (unrelated) |
| 7 | Foreign Vendor arbitrary-ID rejection | **Retained** (unrelated) |

### Disposable resources

All certification disposable databases created under `ltc_verify_phase11c_*` were dropped by runners (`VERIFY_MANAGE_DATABASE=1`). Leftover failed-attempt DBs from polluted-env runs were manually dropped. Docker `ltc-pg16-verify` retained as local verify host only.

### Recommendation

**PHASE 11C — PASS WITH FINDINGS**

Findings: retained #6–#7; honest SQL-only rows in the Phase 11C scenario matrix (07, 09, 10).
