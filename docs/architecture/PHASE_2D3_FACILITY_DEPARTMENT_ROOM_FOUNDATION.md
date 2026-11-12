# Phase 2D-3 — Facility & Department Room Definition Foundation

**Date:** November 9, 2026  
**Nature:** Local implementation + certification. No production/staging deploy. No OT reader retirement.  
**Certification verdict:** **PASS WITH GAPS**  
**Depends on:** [PHASE_2D2_CANONICAL_ROOM_DEPARTMENT_CONFIGURATION_CONTRACT.md](./PHASE_2D2_CANONICAL_ROOM_DEPARTMENT_CONFIGURATION_CONTRACT.md)  
**Protects:** Phase 2C production (`7973254` / `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` on `vssyl.com`)

---

## 1. Starting / ending SHA

| Item | Value |
|---|---|
| Starting / ending Git HEAD | `7973254ee87da2d94291f4282337441944d042fa` |
| Working tree | Uncommitted Phase 2D-3 implementation + preserved 2C/2D-1/2D-2 docs and R4 harness |
| Production / staging | **Unchanged** |

---

## 2. Existing architecture reused

| Layer | Reused as-is |
|---|---|
| Physical identity | `UnitSpace` (+ Floor / Neighborhood `Unit` hierarchy, `FacilityRoomType`) |
| Department membership | `UnitSpaceResponsibility` / `UnitDepartmentResponsibility` via `savePhysicalResponsibility` |
| Department Locations | Existing Locations panel + programming inspector + `composeLocationProgram` / inspect loaders |
| Engine configs | Records attachments, Cycle locations, Teams, Assets — linked/composed, not duplicated |
| Authorization | `requireFacilitySession` + `resolveTeamAuthority.canManage`; CDA write-manifest |
| Facility Room Type catalog UI | Existing `/admin/facility/builder` Room Types panel |

**No new Room/Location model. No Operational Profile / Archetype / OT engine.**

---

## 3. Exact files changed

| Path | Change |
|---|---|
| `prisma/schema.prisma` | `UnitSpaceResponsibility.notes String?` |
| `prisma/migrations/20261109150000_department_space_responsibility_notes/` | Forward migration |
| `src/lib/department-administration/department-space-notes.ts` | Load/update/normalize helpers |
| `src/lib/department-administration/department-space-notes.*.test.ts` | Hermetic + disposable DB tests |
| `src/lib/department-administration/location-program.ts` | `departmentNote` on program location |
| `src/lib/department-administration/load-location-program.ts` | Loads **this Department’s** notes only |
| `src/lib/department-administration/location-room-inspect.ts` | Exposes `departmentNote` |
| `src/app/.../location-room-actions.ts` | `updateDepartmentSpaceNoteAction` |
| `src/app/.../locations-programming-client.tsx` | Physical / Department / Operational sections + note editor |
| `src/app/.../room-types-panel.tsx` | Physical-only Room Type copy |
| `src/lib/department-authority/write-manifest.ts` | Classify note write as `DEPARTMENT` / `department` |
| Tests for Locations programming / room inspect | Updated contracts |
| This report + ARR-004 | Documentation |

Preserved untouched: R4 harness, 2C deploy report, 2D-1/2D-2 docs, OT hubs/readers, Coverage/Plant/offline protocols.

---

## 4. Physical room identity verification

Confirmed:

- Canonical identity remains `UnitSpace.id`
- Facility Builder still edits name, room number, hierarchy, Room Type, shared `description`
- Multi-Department responsibility checkboxes remain on Facility Builder
- Changing physical metadata does not create Records / Cycles / Coverage

Room Type catalog copy updated to state Room Types describe rooms and aid selection; they do **not** automatically create Logs, milestones, Coverage, cleaning, or maintenance.

---

## 5. Responsibility model findings

| Finding | Detail |
|---|---|
| Space membership SoT | `UnitSpaceResponsibility` (`@@unique([spaceId, departmentId])`) |
| Unit membership SoT | `UnitDepartmentResponsibility` |
| Multi-Department | Same Space may have one row per Department; upserts are keyed by pair |
| Capabilities | Existing `capabilities[]` left unchanged; no invented defaults |
| Writer | `savePhysicalResponsibility` updates capabilities only on Space upsert — **does not wipe notes** |

---

## 6. Department note persistence decision

**Decision:** Extend `UnitSpaceResponsibility` with nullable `notes`.

| Rule | Choice |
|---|---|
| Why not a new table | Membership already is Department × Space; notes are descriptive metadata for that membership |
| Blank | Valid (`null`) |
| Isolation | EVS note ≠ Dietary note; Facility `UnitSpace.description` is separate |
| Operational inference | Forbidden — notes are never parsed into Logs/WO/Coverage/due state |
| Lifecycle | **Membership-bound:** deleting the responsibility row deletes the note with it. Restoring responsibility starts with a blank note. Documented explicitly; no silent orphan retention table |
| Max length | 2000 characters |
| Write path | Requires existing responsibility; does not create membership from a note alone |

---

## 7. Department Builder UI changes

Locations inspector now distinguishes:

1. **Physical room** — hierarchy + Facility type; clarifying copy that Room Type is not automatic ops  
2. **Department relationship** — responsibility status + optional Department note (edit when `canManage`)  
3. **Operational configuration** — Teams / Cycles / Logs / Assets (existing engine provenance and links)

No Archetype / Operational Profile authoring surfaces added. No bulk apply UI.

---

## 8. Department-specific data isolation

| Control | Evidence |
|---|---|
| Load scoped by `departmentId` | `loadDepartmentSpaceNotes` filters `departmentId` + facility Spaces |
| Inspect payload | Only the current Department’s `departmentNote` |
| Write scoped | Action uses session facility + manager authority for that `departmentId` + existing responsibility |
| Cross-Department | DB test: Dietary clear does not clear EVS note |
| Cross-facility | Update requires Space in session facility |

**Known related gap (not introduced here):** existing Facility-type log defaults still compose by Room Type for the Department that authored them (compatibility). Documented; not rewired in 2D-3.

---

## 9. Authorization and CDA write classification

| Action | Class | Owner |
|---|---|---|
| `updateDepartmentSpaceNoteAction` | `DEPARTMENT` | `department` |

Enforcement path: facility session + `resolveTeamAuthority(...).canManage`. Read-only managers see note text without the editor. Notes do **not** require Canonical Logs flag (unlike log-default actions).

Write-manifest hermetic test: **pass** (unlisted writes = 0).

---

## 10. Tests and results

| Suite | Result |
|---|---|
| `department-space-notes.hermetic.test.ts` | PASS |
| `department-space-notes.db.test.ts` (disposable `ltc_verify_2d3`) | PASS |
| `location-room-inspect.hermetic.test.ts` | PASS |
| `location-program*.hermetic.test.ts` | PASS |
| `locations-programming.hermetic.test.ts` | PASS |
| `phase-2a-location-function-authoring.hermetic.test.ts` | PASS |
| `write-manifest.hermetic.test.ts` | PASS |
| `physical-responsibility-projection.test.ts` | PASS |

**Skipped in this environment without opt-in:** broader CI `test:db` matrix beyond the disposable verify DB used above.

Production data was **not** used.

---

## 11. Schema / migration status

| Item | Status |
|---|---|
| Migration | `20261109150000_department_space_responsibility_notes` authored |
| Applied to | Disposable local `ltc_verify_2d3` only |
| **Not** applied to | Production, staging, shared DBs, or local `ltc_manager` |
| DROP / LF-OT retirement | None |

---

## 12. Remaining operational reader dependencies

Unchanged from 2D-1/2D-2 (still ARR-004 open):

- `loadSpaceOperationalTypeAssignments` hub and Run consumers  
- Records OT expansion  
- Cycle / Menu / offline OT compatibility  
- Coverage OT matching (explicit `spaceId` column exists; matcher still OT-aware)  
- Historical Review/Audit adapters  
- Facility-type log defaults (room-type composition for authored defaults)

---

## 13. Known limitations

1. Facility-type log default UX still offers “add log to all {type} rooms” as an **existing** Department Facility-type default (ongoing type composition) — incompatible with the long-term no-implicit-application policy; deferred to later 2D reader/config work, not removed here.  
2. No bulk “copy Department room program” yet (by design).  
3. Capabilities arrays not newly surfaced.  
4. Migration not deployed to shared environments.  
5. Dashboard adapter post-filter leak debt remains tracked for 2D-6 (untouched).

---

## 14. Exact Phase 2D-4 prerequisites and scope

### Prerequisites from 2D-3

- Canonical Space identity + multi-Dept responsibility confirmed  
- Independent Department notes available without OT/profile  
- Locations inspect distinguishes physical / Department / engines  
- Fixture design below (no LF/OT bindings)

### Phase 2D-4 — Operational Reader Reconciliation (authorized next only with PO approval)

Re-home legacy OT readers to explicit domain targeting while preserving production applicability:

1. Records run expansion / applicability (`D-OT-02/03/04`)  
2. Operating Rhythm context / applicability (`D-OT-09/10/11/15`)  
3. Menu Runtime OT occurrence (`D-OT-12`)  
4. Dietary meal timing — explicit service locations, **not** `food_service_area` rename (`D-OT-14`)  
5. Offline cycle resolution OT keys (`D-OT-08`) + stop treating hub as forward SoT (`D-OT-01` Run paths)

Out of 2D-4: Coverage/Teams (`2D-5`), schema DROP, bulk apply, Dashboard rewrite, production deploy.

### Deterministic fixture design for 2D-4 (do not seed prod/staging)

| Element | Intent |
|---|---|
| One Facility, one Neighborhood | Physical hierarchy |
| Spaces A (shared), B (Dietary-only), C (unconfigured) | Multi-Dept + progressive config |
| Departments Dietary + EVS | Independent notes on Space A |
| Explicit SPACE LogAttachment on A for Dietary | Records apply without OT |
| Explicit `DepartmentOperationalCycleLocation` on A | Rhythm without OT |
| Space C | Responsibility optional; **no** Records/Cycles → no overdue invention |
| FacilityRoomType “Resident Room” on A/B/C | Type alone creates no requirements |
| **No** profile / archetype / OT bindings | Fail soft if readers still consult empty hub |

---

## Success criteria assessment

| Criterion | Status |
|---|---|
| One canonical physical identity | Met |
| Multi-Department responsibility | Met |
| Independent Department notes | Met |
| Notes not operational inference | Met |
| UI distinguishes layers | Met |
| Server-side isolation for notes | Met |
| Room Type descriptive copy | Met |
| Engines remain authoritative | Met |
| Tests pass (focused) | Met |
| No new classification engine | Met |
| No prod/staging changes | Met |
| Gaps | Type-default log composition remains; migration local-only; OT readers untouched |

**PASS WITH GAPS**
