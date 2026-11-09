# Phase 2D-2 — Canonical Room & Department Configuration Contract

**Date:** November 9, 2026  
**Nature:** Documentation and implementation contracts only. No runtime, schema, migration, or deploy.  
**Certification verdict:** **PASS WITH GAPS**  
**Depends on:** [PHASE_2D1_LOCATION_CLASSIFICATION_DEPENDENCY_AUDIT.md](./PHASE_2D1_LOCATION_CLASSIFICATION_DEPENDENCY_AUDIT.md)  
**Protects:** Phase 2C production (`7973254` / `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` on `vssyl.com`)

---

## 1. Starting / ending SHA

| Item | Value |
|---|---|
| Starting / ending Git HEAD | `7973254ee87da2d94291f4282337441944d042fa` |
| Working tree | Uncommitted Phase 2C R4 harness/docs + 2C deploy report + 2D-1 audit + ARR edits — **preserved; not mixed into runtime** |
| This phase output | This contract + ARR-004 update (docs only) |

---

## 2. Authoritative product-owner architectural decisions

These decisions are **established**. Do not reopen them in later phases:

1. **Facility Builder owns physical room identity** (Facility → Floor → Neighborhood/Unit → Space/Room). One canonical Space identity is shared across Departments.
2. **FacilityRoomType describes physical rooms and aids selection.** It does **not** automatically prescribe Logs, milestones, Coverage, cleaning, PM, or attention.
3. **Department Builder configures how each Department uses assigned Spaces** independently. Multi-Department association to one Space is required.
4. **Operational behavior remains in canonical engines** (Records, Operating Rhythm, Workforce/Coverage, Plant WO, PM, Assets). Department Builder opens those configurations; it does not duplicate them in a general-purpose room profile.
5. **No automatic operational inference** from Room Type or Department assignment alone.
6. **Bulk configuration is a deliberate user action** with preview/confirm; not ongoing inheritance; rooms remain independently editable afterward.
7. **Runtime/Dashboard layering is permission-scoped.** Shared physical identity ≠ operational access. Aggregation is not authorization.
8. **Do not create** a second physical hierarchy, a new OT/archetype engine, or a Department Operational Profile replacement.

### Decision A from 2D-1 — resolved by this contract

| Former open question | Resolution |
|---|---|
| How to distinguish servery vs storage without OT | **Explicit domain targeting to Unit/Space** (and Asset where applicable). FacilityRoomType may help **select** rooms during bulk/config UX; it must not silently apply operational rules. Meal timing follows explicitly configured service locations, not renamed archetypes. |

---

## 3. Physical room identity contract

| Rule | Detail |
|---|---|
| Canonical model | `UnitSpace` (optionally under `Unit` / Floor hierarchy) |
| Identity | One `UnitSpace.id` for all Departments |
| Facility Builder owns | Name, room number, code, nesting (`parentSpaceId`), `facilityRoomTypeId`, shared physical `description`, active/sort |
| Must not own | Department operational rules, Records due state, Coverage expectations |
| Existing UI | `/admin/facility/builder` — structure + room-types tabs (`facility-builder-client.tsx`, `room-types-panel.tsx`) |

Changing physical metadata must not create operational requirements.

---

## 4. FacilityRoomType policy

| Allowed | Forbidden |
|---|---|
| Describe physical classification (facility vocabulary over `baseTypeKey`) | Auto-attach Logs / Cycles / Coverage / PM because of type |
| Help users find rooms (“select all Resident Rooms”) | Reproduce Department Room Archetypes under a new name |
| Support bulk **selection** before explicit apply | Ongoing inheritance for future rooms of the same type |
| Cycle `ROOM_TYPE` mode exists as **compatibility** — document any live use; do not expand as forward OT | Silent reinterpretation of `ROOM_TYPE` as operational policy |

Committed configuration after selection must persist through each domain’s own targeting contract (typically explicit Space/Unit ids).

---

## 5. Department-specific room definition contract

Three information kinds — do not collapse:

### A. Physical details — Facility Builder

Existing: `UnitSpace` fields + `FacilityRoomType`.

### B. Department-specific descriptive details — Department × Space relationship

| Status | Finding |
|---|---|
| Existing | `UnitSpaceResponsibility` (`spaceId`, `departmentId`, `capabilities[]`) |
| Existing (Unit grain only) | `UnitDepartmentResponsibility` also has `riskLevel` / `cleaningFrequency` / `inspectionFrequency` |
| **MISSING** | Durable Department-scoped free-text instructions / intended-use notes on a Space (not shared Facility `description`) |

Descriptive details **must not** by themselves create due/overdue/uncovered outcomes.

If 2D-3 confirms product need for notes, the **minimal** relationship is an extension of the responsibility association (or a thin 1:1 Department×Space note row) — **not** a new Operational Profile/Archetype graph. Do not invent fields “to fill the UI.”

### C. Domain-owned configuration — canonical engines

Belong in Records, Cycles, Coverage, Assets, Teams, Menus, Plant — each with their own persistence. Department Builder links out / composes; Locations inspect already projects provenance (`composeLocationRoomInspect`).

**Association ≠ requirement:** adding `UnitSpaceResponsibility` does not invent Logs, milestones, or Coverage.

---

## 6. Operational engine ownership matrix

| Engine | Owns | Configures against places via | Department Builder role |
|---|---|---|---|
| Facility structure | Physical identity | Facility Builder | Read physical context |
| Responsibility | Dept ↔ Space/Unit membership | `UnitSpaceResponsibility` / `UnitDepartmentResponsibility` | Assign / inspect |
| Records | Attachments, requirements, evidence | `LogAttachment` (`SPACE`/`UNIT`/`DEPARTMENT`/`ASSET`/…) | Attach / manage via Records UI |
| Operating Rhythm | Cycles, Key Points | `locationMode` + `DepartmentOperationalCycleLocation` | Cycle Builder |
| Assignment | Who covers where | Assignment locations | Staffing |
| Coverage | Staffing expectations / episodes | Template items (today OT keys; explicit Space **partial/missing**) | Coverage config |
| Menus | Applicability | Explicit unit/space | Menu Builder |
| Assets / Plant / PM | Equipment & work | Asset placement + WO/PM owners | Asset/Maintenance UIs |
| Runtime Location State | Composition only | Prefetch by authorized departmentIds | — |
| Dashboard | Composition only | Viewer `scopeDepartmentIds` | — |

---

## 7. Explicit targeting contract

| Dimension | Use |
|---|---|
| Facility | Rare / facility-wide Records where domain supports |
| Department | Department-wide obligations when explicitly attached |
| Neighborhood/Unit | Explicit unit targets |
| Space | Primary precise target |
| Asset | Equipment-bound Records / WO |
| FacilityRoomType | **Selection aid** for choosing Spaces during config/bulk; committed result should be concrete place ids unless a domain documents a deliberate dynamic selector |

**No universal targeting enum or engine.** Each domain resolves its own explicitly configured applicability.

### Domain notes

| Domain | Supported forward | Legacy / gap |
|---|---|---|
| Records | SPACE, UNIT, DEPARTMENT, ASSET (attach UI) | Schema still has `OPERATIONAL_TYPE`; run expanders still OT-aware (2D-4) |
| Cycles | `EXPLICIT_UNITS`, `ALL_DEPARTMENT_UNITS` live in prod | `OPERATIONAL_TYPES`, `ROOM_TYPE`, `UNIT_TYPES` compatibility |
| Coverage | OT keys on template items | Explicit Space column **MISSING** on template schema — 2D-5 must add domain-owned explicit targeting, not OT rename |
| Menus | Explicit unit XOR space | Pattern display still may read archetype bindings (CFG) |
| Meal timing | Must move to explicit service locations | `food_service_area` archetype binding (D-OT-14) — **do not rename to kitchen** |

### Progressive configuration

Missing optional config must not invent overdue Records, missed milestones, uncovered staffing, cleaning obligations, or maintenance exceptions.

---

## 8. Bulk configuration semantics

**Approved concept:** “Apply configuration to all selected rooms” as a deliberate action.

### Required behavior (contract for later implementation — not built in 2D-2)

1. User selects existing configuration or creates one (in the owning engine).  
2. User selects room scope (type filter, Neighborhood, manual multi-select).  
3. App resolves **exact** target Space ids (authorized + in Department footprint).  
4. Preview affected rooms and proposed changes.  
5. User confirms.  
6. Each eligible room receives configuration via **that domain’s write service**.  
7. Rooms remain independently editable afterward.  
8. Future rooms of the same type do **not** auto-inherit.  
9. Editing one room does not silently rewrite siblings.

### Conflict protection (must be domain-specific)

UI must distinguish at least:

- Apply only where no configuration exists  
- Update selected existing configuration  
- Leave existing unchanged  
- Replace only with explicit confirmation  

Records dedupe/lifecycle, Cycle location uniqueness, Coverage identity, Menu applicability XOR rules — each engine keeps its own conflict semantics. **No generic bulk operational requirement table.**

### Existing bulk-adjacent capabilities

| Exists | Missing |
|---|---|
| Bulk create Spaces; apply responsibility to descendants; CSV imports; add remaining rooms of type to Team | Copy full Department room program across rooms; engine-level “apply this Log/Cycle/Coverage to selection” with preview |

---

## 9. Independent room customization

After any bulk apply:

- Room 2A202 may gain unique Department instructions or different engine bindings.  
- Must not require a new FacilityRoomType or archetype.  
- Must not alter other Departments’ configuration on the same Space.  
- Must not force mass rewrite of sibling Resident Rooms.

---

## 10. Permission-scoped layered runtime

| Rule | Contract |
|---|---|
| A | Shared physical identity ≠ operational access |
| B | Department operational access is scoped |
| C | Read ≠ write |
| D | Authorize/filter **server-side before** payload exposure |
| E | Aggregates (counts, readiness, exceptions, search, notifications, exports) must not leak unauthorized Departments |
| F | Assignment/location/partner/operator constraints remain additional |

### Existing enforcement (partial)

| Surface | Status |
|---|---|
| RLS prefetch by `departmentId` set | EXISTING |
| Dashboard viewer `scopeDepartmentIds` + in-query filter contract | EXISTING (documented gaps: some adapters post-filter / facility-wide helpers) |
| Partner location footprint from responsibility | EXISTING |

**Gap finding (do not fix in 2D-2):** Dashboard adapters called out in Department Dashboard Contract still risk load-then-drop patterns. Owner: Dashboard program / RLS consumers. Track as authorization hardening debt under ARR-004 dependents; certify in 2D-6.

---

## 11. Dashboard / RLS authorization boundaries

Shared `UnitSpace.id` is the composition key.

| Layer | Source | Visibility |
|---|---|---|
| Physical context | Facility structure | Per facility access rules |
| Department layer N | That Department’s engines | Only if user authorized for Department N |
| Records / Rhythm / Assignment / Coverage / Assets | Canonical engines | Same |
| Attention | Notifications engine + policy | Existing N* rules; no second copy |

Multi-Department authorized users may see multiple layers for one Space. Department-only users see only their layer. Do not persist a second operational state store in Dashboard.

---

## 12. High-risk legacy dependency replacements

| ID | Legacy input | Current behavior | Canonical SoT | Supported replacement | Missing | Dept-room notes | Auth | Historical | Phase | Tests |
|---|---|---|---|---|---|---|---|---|---|---|---|
| D-OT-01 | ACTIVE profile bindings | Hub maps Space→OT key | Explicit place ids + responsibility | Stop being forward SoT; consumers call domain resolvers | Remove hub from Run paths | N/A | Facility/Dept scoped | Keep table until drop | **2D-4** | Hermetic: empty bindings fail soft |
| D-OT-02/03/04 | `LogAttachment.OPERATIONAL_TYPE` | Run expands via hub | Explicit SPACE/UNIT/… attachments | Existing attach kinds | Migrate any future OT rows to SPACE | N/A | Attach authority | Retain OT read for history | **2D-4** | Run requirements + progressive config |
| D-OT-05/06 | Template OT keys + bindings | Episode/match OT-first | Explicit Space on Coverage items | Partial tests exist; **schema Space missing** | Persist + match `spaceId` | N/A | Staffing authority | Compat OT keys | **2D-5** | Coverage episode SQL + hermetic |
| D-OT-08 | OT keys in offline bundle | Cycle resolve uses OT children | Explicit cycle locations | Prod cycles already EXPLICIT/ALL | Strip OT from bundle path | N/A | SPACE responsibility | Offline command compat | **2D-4** | Offline CI-gate |
| D-OT-09/10/11/15 | OT in cycle presentation/applicability | OT mode library still live | `DepartmentOperationalCycleLocation` | EXPLICIT/ALL | Retire OPERATIONAL_TYPES from Run presentation | N/A | Dept | Compat modes | **2D-4** | Cycle resolve hermetic |
| D-OT-12 | OT for menu cycle occurrence | Loads hub | Explicit cycle locations | Menu location already explicit | Drop OT occurrence check | Display pattern CFG | Dept | — | **2D-4** | Menu runtime hermetic |
| D-OT-13 | Team OT keys / bindings | Walk-list expansion | Explicit `DepartmentTeamRoomMembership` | Memberships exist | Stop OT union | N/A | Team/dept | — | **2D-5** | Team scope hermetic |
| D-OT-14 | `food_service_area` bindings | Meal timing spaces | Explicit service location config | None for OT rename | Explicit Dietary service Spaces (or cycle/menu-owned list) | Optional notes | Dietary | — | **2D-4** | Meal timing SQL/hermetic |
| D-CFG-01–08 | Profile patterns / OT guidance | Build display & guidance | Responsibility + engine inspect | Locations inspect | Strip OT guidance; optional notes in 2D-3 | Notes if approved | Build roles | — | **2D-3/5** | Builder composition |
| D-HIST-01–05 | Bindings / OT maps | Review/Audit reconstruct | Historical adapters | Keep | No DROP | N/A | Read isolation | Required | **2D-5/6** | Review hermetic |

---

## 13. Existing implementation capabilities

| Area | Verdict |
|---|---|
| Facility Builder room CRUD + Room Types | EXISTING |
| Bulk create Spaces; responsibility sync / apply to descendants | EXISTING |
| Department Locations inspect / actionable footprint | EXISTING |
| Records SPACE attach; Cycles explicit locations; Menus explicit; Assets on Space | EXISTING |
| RLS/Dashboard department scoping | EXISTING (with known adapter gaps) |
| Offline SPACE auth via responsibility | EXISTING |

---

## 14. Missing implementation contracts

| Gap | Owner phase | Notes |
|---|---|---|
| Department×Space descriptive notes (if product requires) | **2D-3** | Minimal persistence only; no profile engine |
| Responsibility capability UX beyond empty arrays | **2D-3** | Optional; presets exist |
| Coverage explicit Space persistence + matcher | **2D-5** | Do not fake via FacilityRoomType |
| Meal timing explicit service locations | **2D-4** | Replace archetype key |
| OT hub removal from Run/offline/menu/records | **2D-4** | Fail soft |
| Team scope without OT | **2D-5** | |
| Bulk apply with preview/conflict for domain configs | Later (post 2D-3 foundation; not required to start 2D-4) | Use domain writers |
| Dashboard adapter post-filter leaks | Track + **2D-6** certify | Auth hardening |

---

## 15. UX architecture (reuse, no mock UI)

### Facility Builder

- Hierarchy navigation, Room Type management, individual room editor (existing).  
- Show which Departments are responsible (existing checkboxes).  
- Do not author Department operational rules here.

### Department Builder — Locations

- Browse Department footprint (`collectDepartmentActionableLocations`).  
- Inspect Department’s own engine provenance (existing inspect).  
- Link to Records / Cycles / Coverage / Assets UIs (existing).  
- Future: Department notes; multi-select + “Apply configuration…” entry points that open domain apply flows.  
- Conflict preview before overwrite.

### Runtime

- Department-scoped room/Job Flow views.  
- Multi-Department layered view only when authorized.  
- Compose via RLS/Dashboard — no duplicated engines.

---

## 16. Historical compatibility

Retain LF/profile/archetype schema and historical Review/Audit readers until a **separately authorized** schema program after 2D-6. Preserve offline command contracts and ARR-003 Work compatibility. Historical rows must not become forward requirements.

**No migrations, DROP, or production data changes in 2D-2.**

---

## 17. Regression and certification plan (design only)

| Theme | Assertions |
|---|---|
| Room identity | One Space; multi-Dept; physical edit ≠ ops requirements |
| Department independence | EVS vs Dietary configs isolated; per-room edit |
| Bulk (when implemented) | Explicit select; preview; conflict modes; no auto-inherit |
| Authorization | Dept-only isolation; aggregates; read≠write; Assignment limits |
| Operational | No type-implied Logs/Coverage/milestones; explicit targets stable; Plant owned; offline compat; historical OT readable |

Reuse: offline CI-gate, cycle/records hermetics, coverage SQL, dashboard contract tests. Missing: coverage explicit-space persistence tests; meal-timing without archetype; bulk apply suites; layered auth leak tests.

---

## 18. Exact Phase 2D-3 implementation scope

**Phase 2D-3 — Facility/Department Room Definition Foundation**

### In scope

1. Verify Facility Builder physical contract against this document (fix only gaps that violate Layer 1 — prefer docs/UX copy over schema churn).  
2. Confirm responsibility association is the Department↔Space membership SoT; expose/clarify capabilities only if already supported without new engines.  
3. If PO confirms need for Department-specific descriptive notes: design + implement **minimal** Department×Space note persistence (or defer with explicit “MISSING accepted” if notes are not required for 2D-4).  
4. Department Builder Locations: ensure inspect shows physical + responsibility + engine links without OT/archetype authoring.  
5. Department-scoped Build permissions unchanged; classify any new write in CDA write-manifest.  
6. Document FacilityRoomType as selection aid in Build UX copy where it currently implies operational meaning.  
7. Produce fixture notes for 2D-4 (explicit SPACE Records/Cycles; no LF/OT seed).

### Out of scope for 2D-3

- OT reader rewires (2D-4+)  
- Coverage explicit Space schema (2D-5)  
- Bulk apply implementation  
- Schema DROP / migrations for profile tables  
- Auth behavior rewrites  
- ARR-008, EVS execution, Plant WO/PM changes, Scheduled Evaluation / Web Push  
- Deploy

### Adjusted sequence (supersedes 2D-1 §18 ordering)

| Phase | Focus |
|---|---|
| **2D-3** | Room definition foundation (this section) |
| **2D-4** | Records, Operating Rhythm, Menu Runtime, meal timing, offline cycle OT |
| **2D-5** | Coverage, Teams, projections, Build guidance, remaining OT readers |
| **2D-6** | Integrated certification |

---

## Success criteria

| Criterion | Status |
|---|---|
| PO architecture formalized | Met |
| FacilityRoomType / bulk / independence / auth-layering contracts written | Met |
| Existing vs missing capabilities grounded in code | Met |
| High-risk OT replacements mapped with phases | Met |
| Decision A closed without new engine | Met |
| No runtime/schema/prod changes | Met |
| Gaps | Coverage explicit Space still missing; optional Dept notes undecided as implement-now vs defer; Dashboard adapter leak debt tracked |

**PASS WITH GAPS** — contract complete; implementation gaps explicitly deferred to 2D-3+.
