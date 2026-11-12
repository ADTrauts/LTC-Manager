# Phase 2D-1 — Location Function & Operational Classification Dependency Audit

**Date:** November 9, 2026  
**Nature:** READ-ONLY audit. No runtime, schema, migration, or production mutation.  
**Certification verdict:** **PASS WITH GAPS**  
**Program context:** Phase 2C production deploy complete (`7973254` / `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` on `vssyl.com`). Production release protected.

---

## 1. Starting and ending SHA

| Item | Value |
|---|---|
| Starting / ending Git HEAD | `7973254ee87da2d94291f4282337441944d042fa` |
| Working tree | Dirty with **uncommitted Phase 2C R4 harness/docs** + Phase 2C deployment report + ARR edits — **not mixed into Phase 2D runtime**; this audit adds documentation only |
| Excluded from this phase | `.neon`, secrets, disposable DB artifacts |
| Method | Repository search of `src/` + Prisma; direct reads of hub resolvers; SELECT-only production aggregates |

Uncommitted Phase 2C R4 materials (`scripts/verify/r4-*`, `tests/r4-release-browser/`, R4/deploy reports) are preserved as certification/deploy evidence and are out of Phase 2D implementation scope.

---

## 2. Scope and inspection method

Inspected:

- Product Constitution / 01A / 01B, ARR (esp. ARR-004/018/026), Phase 2A authoring close, Phase 2C R4 + production deploy reports
- Prisma models for profiles, archetypes, bindings, responsibility, FacilityRoomType, LogAttachment, cycles
- Call sites of `loadSpaceOperationalTypeAssignments`, `departmentRoomArchetypeBinding`, `OPERATIONAL_TYPE` / `OPERATIONAL_TYPES`, Location Function writers/readers
- Read-only production Neon aggregates (no PII beyond aggregate counts)

Not inspected as executable behavior change: no browser mutation, no migrate, no DROP.

---

## 3. Canonical physical and responsibility architecture

### Facility hierarchy (physical)

**Facility → Floor → Neighborhood (`Unit`) → Space/Room (`UnitSpace`)**

Physical identity and containment are Facility-owned. `FacilityRoomType` is the facility vocabulary for physical room classification (e.g. `kitchen`, `guest_room`, `restroom`). It is **not** Location Function and must not be retired by this program merely because LF authoring closed.

### Department responsibility

| Model / service | Role |
|---|---|
| `UnitSpaceResponsibility` | Authoritative Department ↔ Space responsibility (capabilities array) |
| `UnitDepartmentResponsibility` | Neighborhood-grain Department association (schema present; production count currently 0) |
| Facility Builder / composition services | Assign and compose responsibility without LF bind/publish |
| Offline SPACE `authorize` (`src/lib/offline/space/service.ts`) | Requires `UnitSpaceResponsibility` (Phase 2C R3) — **not** ACTIVE LF binding |

### Operational configuration (domain-owned)

Separate from physical identity and from Department responsibility:

| Domain | Canonical targeting already available |
|---|---|
| Operating Rhythm | `DepartmentOperationalCycle` + `locationMode` (`ALL_DEPARTMENT_UNITS`, `EXPLICIT_UNITS`, …) + `DepartmentOperationalCycleLocation` (unitId/spaceId) |
| Records | `LogAttachment.targetKind` ∈ `ASSET` / `SPACE` / `UNIT` / `DEPARTMENT` / `FACILITY` (+ legacy `OPERATIONAL_TYPE`) |
| Assignment / Coverage | Explicit Assignment locations; EVS location coverage via responsibility; template items may still carry OT keys |
| Menus | Explicit unit/space applicability + cycle stable keys (`menu-applicability-db` / `menu-runtime-db`) |
| Plant WO / PM | Asset placement + Plant ownership — not generic Work Plan / LF |

**Do not introduce a second physical hierarchy or a new generic location classification engine.**

---

## 4. Legacy concept definitions (keep distinct)

| Concept | What it is | Not the same as |
|---|---|---|
| **Location Function (LF)** | Retired product/authoring notion of binding a “function” to a room; writers throw `LOCATION_FUNCTION_AUTHORING_RETIRED` | Physical Space identity; FacilityRoomType |
| **Department Operational Profile** | Versioned Department admin profile (`DRAFT`/`CERTIFIED`/`ACTIVE`/`RETIRED`) owning areas/experiences/archetypes | Facility vocabulary; Operating Rhythm cycle |
| **Department Room Archetype** | Profile-scoped operational pattern key/name (historically doubled as “Operational Type”) | FacilityRoomType base keys |
| **Archetype binding** | Maps `UnitSpace` → archetype under a profile | `UnitSpaceResponsibility` |
| **Operational Type (OT)** | Runtime key usually = archetype.key; used in `OPERATIONAL_TYPES` cycle mode, `LogAttachment.OPERATIONAL_TYPE`, coverage/team/work applicability | Physical room type; employee Job Role (ARR-008) |
| **FacilityRoomType** | Physical room classification catalog | Operational Type / LF |

---

## 5. Complete active reader inventory (summary)

Approximate `src/` surface (excluding tests):

| Pattern | Scale |
|---|---|
| OT / `OPERATIONAL_TYPE` / applicability keys | ~140 files touch terminology (many tests/docs) |
| Profile / archetype / binding loaders | ~50 files |
| LF bind/publish / catalog | ~29 files (mostly retired writers + product catalog keys) |
| Non-test callers of `loadSpaceOperationalTypeAssignments` | **10 consumers + hub** |
| Non-test direct `departmentRoomArchetypeBinding` readers | **~10** |

### Hub (must treat as single expansion bus)

`src/lib/operational-cycles/load-operational-type-targets.ts` — `loadSpaceOperationalTypeAssignments` / `selectProfileIdForOperationalTypes` / `assignmentsFromBindings`  
Reads ACTIVE (runtime) or DRAFT→ACTIVE (working) profile bindings and maps `unitSpaceId → { key, name }`.

### Active runtime readers (forward Run behavior)

| ID | Consumer | Concept | Use |
|---|---|---|---|
| D-OT-01 | `load-operational-type-targets.ts` (hub) | Profile/Archetype/OT | Room OT identity |
| D-OT-02 | `canonical-logs/load-run-requirements.ts` | OT | Expand OT LogAttachments → spaces |
| D-OT-03 | `canonical-logs/load-target-run-logs.ts` | OT | Space Run Logs include OT-matched attachments |
| D-OT-04 | `canonical-logs/log-operational-type-applicability.ts` | OT | Matcher still matches OT keys |
| D-OT-05 | `scheduling/coverage-episodes/observe.ts` | Binding/OT | Coverage episode slot expansion |
| D-OT-06 | `scheduling/coverage-expectations/match-expectation.ts` | OT keys | Match template items to rooms by OT |
| D-OT-07 | `department-work/load-runtime-work.ts` + `resolve-requirements.ts` | OT | Work Plan OT applicability (compatibility path) |
| D-OT-08 | `offline/build-runtime-bundle.ts` | OT | Offline cycle resolve child OT keys |
| D-OT-09 | `operational-cycles/load-run-operation-presentation.ts` | OT | Run presentation context |
| D-OT-10 | `operational-cycles/load-employee-cycle-context.ts` | OT | Unit grain child OT keys |
| D-OT-11 | `operational-cycles/load-supervisor-cycle-overview.ts` | OT | Supervisor overview OT context |
| D-OT-12 | `menu-runtime-db.ts` | OT | Cycle occurrence when mode is OT |
| D-OT-13 | `dashboard/viewer/viewer-team-scope.ts` | Binding/OT | Team walk-list room expansion |
| D-OT-14 | `dietary/record-meal-timing.ts` | Archetype key | Finds `food_service_area` spaces via bindings |
| D-OT-15 | `operational-cycles/cycle-applicability.ts` + resolve/present | OT mode | Library matching for `OPERATIONAL_TYPES` |

### Active configuration / Build readers

| ID | Consumer | Concept | Use |
|---|---|---|---|
| D-CFG-01 | `menu-applicability-db.ts` `loadRoomPatternBySpaceId` | Profile/Archetype | Display pattern for menu location picker |
| D-CFG-02 | `department-administration/load-effective-location-program.ts` | Archetype overlays | Build-time room program overlays |
| D-CFG-03 | `department-administration/builder-context-summary.ts` / overview-guidance | OT | Unmatched published OT guidance |
| D-CFG-04 | `department-administration/department-locations.ts` | Optional pattern | Display enrichment on responsible rooms |
| D-CFG-05 | `canonical-logs/target-labels.ts` | Archetype | Label OT targets |
| D-CFG-06 | `department-teams/service.ts` + OT applicability helpers | OT keys | Still persists team OT keys |
| D-CFG-07 | Coverage expectation service writers | OT keys | Still validates/writes OT on template items |
| D-CFG-08 | Cycle service / validate / defaults | `OPERATIONAL_TYPES` mode fields | Persistence of OT mode (new UI prefers explicit) |

### Historical / audit / review

| ID | Consumer | Concept | Use |
|---|---|---|---|
| D-HIST-01 | `operational-review/load-operational-review-day-facts.ts` | Bindings | Reconstruct OT-by-space for day |
| D-HIST-02 | `operational-review/load-operational-review-range-facts.ts` | Bindings | Range reconstruction |
| D-HIST-03 | `operational-review/historical-operational-type.ts` + compose | OT | Historical OT map |
| D-HIST-04 | `audit/load-audit-records.ts` | Bindings / OT as locationFunctionKey | Audit slot expansion / filters |
| D-HIST-05 | Reports UI filter `locationFunction` | OT naming | Filter param alias |

### Compatibility / dormant / authoring-closed

| ID | Consumer | Class |
|---|---|---|
| D-LEG-01 | `profile-service` LF/OT/archetype writers | Legacy authoring — throw retired |
| D-LEG-02 | Admin department `actions.ts` LF/OT actions | Legacy authoring — return retired |
| D-LEG-03 | `department-products/location-functions.ts` | Product catalog keys (preset identity) — not room ownership |
| D-LEG-04 | RLS Wave E prefetch (`operationalTypeKey: null`) | Compatibility — OT forced null for RLS evidence/cycles |
| D-LEG-05 | Offline SPACE authorize | Already canonical responsibility |
| D-LEG-06 | Catalog assign create path | Skips creating new OT attachments |
| D-SCH-01 | Prisma profile/archetype/Experience graph + OT columns | Schema compatibility debt (Nov 6 restore) |

**Count of significant active legacy dependencies (runtime + config + historical that still read profile/binding/OT for behavior):** **≈ 30** (15 runtime + 8 config + 5 historical + 2 schema/catalog adapters treated as live risk). Documentation-only and pure retired-throw sites excluded from this count.

---

## 6. Dependency matrix (highest priority)

| ID | Concept | Owner | Source | Consumer | Use | Activity | Replacement | Data impact | Auth | Risk | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| D-OT-01 | Profile/Archetype/OT | Operational Cycles / shared | `load-operational-type-targets.ts` | Many Run loaders | Room OT identity | Active | Explicit place ids + domain targeting; optional FacilityRoomType where physical | Empty prod bindings → expanders return empty | Facility/Department scoped queries | **HIGH** | Replace hub first |
| D-OT-02/03 | OT | Records | LogAttachment OT + hub | Run requirements / target logs | Evidence applicability | Active | Prefer SPACE/UNIT/DEPARTMENT/ASSET attachments | Prod: 0 OT attachments; 2 SPACE + 2 ASSET | Dept/facility attach authority | **HIGH** | Replace readers; retain historical OT rows if any appear later |
| D-OT-05/06 | OT/Binding | Coverage | Bindings + template OT keys | `observe.ts`, matcher | Coverage expectations | Active | Explicit `spaceId` on template items; responsibility for required rooms | Prod: 0 OT template rows | Dept staffing authority | **HIGH** | Replace |
| D-OT-07 | OT | Work compatibility | Work Plan applicability OT | Runtime work loaders | Plan-derived eligibility | Active (compat) | ONE_OFF + explicit; Work Plan authoring already retired | Prod: 0 OT applicability rows | Work authority | **MEDIUM** | Retire with Work compat program; do not block Records/OR |
| D-OT-08 | OT | Offline | Hub via bundle builder | Offline dietary bundle | Cycle OT children | Active | Explicit cycle locations already canonical | Empty OT → fail soft if cycles explicit | SPACE responsibility gate already canonical | **HIGH** | Replace |
| D-OT-12 | OT | Menus | Hub + cycle mode | `menu-runtime-db` | Whether cycle “occurs” | Active | Explicit cycle locations (`DepartmentOperationalCycleLocation`) | Prod cycles: EXPLICIT/ALL only | Menu/dept authority | **MEDIUM** | Replace |
| D-OT-13 | Binding/OT | Dashboard/Teams | Bindings + team OT keys | `viewer-team-scope` | Walk-list rooms | Active | Explicit team membership / responsibility | Prod: 0 team OT keys | Team/dept scope | **MEDIUM** | Replace |
| D-OT-14 | Archetype | Dietary | Binding by key `food_service_area` | Meal timing | Which spaces get meal timing | Active | Explicit space list or FacilityRoomType if product accepts physical | Empty bindings → no spaces | Dietary dept | **HIGH** | Investigate → PO if physical vs operational |
| D-HIST-* | Binding/OT | Review/Audit | Bindings | Day/range/audit | Historical reconstruction | Historical | Keep adapters until schema retirement; do not invent overdue | Empty OK | Read isolation | **MEDIUM** | Retain compatibility |
| D-CFG-01 | Profile | Menus | Bindings | Pattern display | UX label only | Active config | FacilityRoomType display name or responsibility-only label | Empty → no pattern | N/A | **LOW** | Replace display |
| D-LEG-01/02 | LF | Admin | Retired writers | Actions/UI | Authoring | Closed | — | — | — | **LOW** | Retain retired stubs until schema drop |
| D-SCH-01 | Schema | Platform | Prisma restore | Persistence | Compatibility | Schema | Forward-only drop after readers gone | Tables empty in prod | — | **HIGH if dropped early** | Retain until 2D cert |

---

## 7. Records / Harbor findings

- Canonical targeting **already supports** Facility / Department / Unit / Space / Asset.
- New catalog assign path **skips creating** `OPERATIONAL_TYPE` attachments; persistence/validation still accept the enum.
- Run loaders **still expand** any existing OT attachments via the hub (`load-run-requirements`, `load-target-run-logs`, matcher).
- Production: **0** OT attachments; **2** SPACE + **2** ASSET — forward path is already explicit.
- Risk if readers removed carelessly: none for current prod rows; risk if customers later import OT attachments without SPACE remapping.
- Harbor Catalog itself is not an LF engine; do not convert OT → “whole Department” silently.

---

## 8. Operating Rhythm findings

- Canonical modes in production: **`EXPLICIT_UNITS` (27)** and **`ALL_DEPARTMENT_UNITS` (3)**; **`OPERATIONAL_TYPES` (0)**.
- **`DepartmentOperationalCycleLocation` = 107** explicit place rows — primary live targeting.
- Code still supports `OPERATIONAL_TYPES` and `ROOM_TYPE` modes; OT mode expands via hub + child OT keys on unit grain.
- Menu Runtime still loads OT to decide cycle occurrence when a cycle uses OT mode.
- Do not rebuild Operating Rhythm or Scheduled Evaluation.

---

## 9. Workforce / Coverage findings

- EVS / Assignment **location coverage** uses responsibility (`location-coverage.ts`) — canonical.
- Coverage **episodes** and **expectation matcher** still OT-aware; template schema retains `applicableOperationalTypeKeys`.
- Production OT template rows: **0**.
- Teams still have OT key columns; production OT-populated teams: **0**.
- Do not reopen ARR-008 Job Role consolidation.
- Missing optional Coverage config must not fabricate uncovered staffing (preserve progressive configuration).

---

## 10. Plant / EVS findings

- Plant Work Orders / PM are **not** generic Work Plan/LF; preserve as-is.
- Projection/locations paths still load profile/archetype for some Today’s Work / sidebar composition (Wave E forces actionable eligibility toward responsibility — bindings may still be loaded).
- EVS cleaning execution redesign is **out of scope**; EVS location coverage already responsibility-based.
- Dietary meal timing’s `food_service_area` archetype key is a concrete operational distinguisher that responsibility alone does not encode.

---

## 11. RLS / Review findings

- RLS Wave E: OT forced null for cycle/evidence compose — Location Program prefers explicit SPACE/ASSET logs + teams.
- Operational Review day/range facts still load archetype bindings for historical OT maps (ARR-018).
- Do not rebuild RLS or Review; keep historical adapters until schema retirement is separately approved.

---

## 12. Offline dependencies

| Path | Status |
|---|---|
| SPACE offline authorize | **Canonical** — `UnitSpaceResponsibility` |
| Offline runtime bundle cycle resolve | **Still OT-aware** via `loadSpaceOperationalTypeAssignments` |
| Offline command contracts / ONE_OFF | Protected by Phase 2C — do not change contracts here |

---

## 13. Authorization findings

- Facility and Department scoping remain on most loaders (facilityId/departmentId filters).
- Replacing OT expansion with “all Spaces under Department” would **broaden** applicability and is forbidden without explicit policy.
- SPACE offline already gates on responsibility — correct pattern for replacements.
- Partner/operator and Assignment visibility remain separate; no generic cross-domain auth shortcut.
- UI hiding ≠ authorization (retired LF actions still must throw/return retired).

---

## 14. Production occupancy (safe aggregates)

Host: Neon production pooler (same environment as Phase 2C deploy). SELECT-only.

| Object | Occupancy |
|---|---|
| `DepartmentOperationalProfile` | **0** rows (all statuses) |
| `DepartmentRoomArchetype` / Bindings / Experience exceptions | **0** |
| `UnitSpaceResponsibility` | **19** |
| `UnitDepartmentResponsibility` | **0** |
| `FacilityRoomType` (active) | **4** (`kitchen`×2, `guest_room`, `restroom`) |
| `LogAttachment` | SPACE **2**, ASSET **2**, OT **0** |
| Cycle `locationMode` | EXPLICIT_UNITS **27**, ALL_DEPARTMENT_UNITS **3**, OPERATIONAL_TYPES **0** |
| `DepartmentOperationalCycleLocation` | **107** |
| Team / cycle / coverage template OT key cardinality > 0 | **0** |
| Work Plan applicability OT | **0** |

**Interpretation:** Production forward operations already run on responsibility + explicit cycle locations + SPACE/ASSET Records. Legacy profile/OT tables are **empty but still wired in code**. Empty tables ≠ safe to drop; empty tables **do** mean current customers are not depending on populated OT bindings for live results.

---

## 15. Historical compatibility risks

1. Premature DROP of profile/archetype tables would break restore history and any future import of OT-targeted attachments (Phase 2C lesson).
2. Review/Audit OT reconstruction must remain readable even when ACTIVE profile is absent (fail soft).
3. Work Plan OT applicability is compatibility debt (ARR-003) — do not delete Work tables here.
4. Reports filter alias `locationFunction` is naming debt, not physical LF.

---

## 16. Test and fixture dependencies

| Class | Examples | Disposition for later phases |
|---|---|---|
| Current and valid | Responsibility-based offline/space tests; explicit cycle location tests | Keep |
| Needs canonical fixture update | Coverage episode DB tests that `create` archetype bindings; OT cycle applicability suites | Update fixtures to explicit SPACE |
| Historical compatibility | Review OT reconstruction hermetics; audit OT filters | Keep until schema drop |
| Obsolete assertion | Tests requiring LF bind/publish to succeed | Already expect retired in 2A |
| Unverified | Projection Today’s Work OT residual behavior under empty bindings | Certify in 2D-6 |

Do not rewrite tests in 2D-1.

---

## 17. Product-owner decisions

### Decision A — Operational distinguisher after OT/archetype removal — **RESOLVED in Phase 2D-2**

**Ambiguity (historical):** A Department may be responsible for both a servery and a storage room. Responsibility alone does not encode different Records / Rhythm / Coverage / dietary meal-timing expectations.

**Resolution (Phase 2D-2 PO architecture):** Explicit domain targeting to Unit/Space (and Asset where applicable). FacilityRoomType may help **select** rooms during bulk/config UX; it must **not** silently apply operational rules. Meal timing follows explicitly configured service locations — do **not** rename `food_service_area` to kitchen/servery. See [PHASE_2D2_CANONICAL_ROOM_DEPARTMENT_CONFIGURATION_CONTRACT.md](./PHASE_2D2_CANONICAL_ROOM_DEPARTMENT_CONFIGURATION_CONTRACT.md) §2 / §7 / D-OT-14.

**No longer blocks** 2D-3+. Reader rehomes proceed under the 2D-2 staged sequence (room-definition foundation first, then OT readers).

### Decision B — Historical OT attachments / Review maps (does not block 2D-2)

Keep read adapters until a later schema program. No DROP now.

### Decision C — Residual Work Plan OT applicability (does not block 2D-2)

Carry with ARR-003; do not expand Work Plan authoring.

---

## 18. Recommended Phase 2D implementation sequence

**Superseded by Phase 2D-2 §18.** Current authorized sequence:

| Phase | Intent |
|---|---|
| **2D-2** | ✅ Complete — canonical room/Department configuration contract (docs only) |
| **2D-3** | Facility/Department room-definition foundation (physical + responsibility + optional Dept notes; no profiles/archetypes) |
| **2D-4** | Records + Operating Rhythm + Menu Runtime + meal timing + offline cycle OT — rehome readers; fail soft |
| **2D-5** | Coverage episodes/expectations + team scope + projections + Build guidance + remaining OT readers |
| **2D-6** | Integrated hermetic/SQL/browser/offline/auth certification |

Only after 2D-6 may a **separately approved** schema-retirement program consider dropping profile/archetype tables.

---

## 19. Precise proposed Phase 2D-2 scope

**In scope (docs + contracts + tests design; minimal code only if required to encode the contract without behavior change):**

1. Written targeting contract: which engines may use Facility / Department / Unit / Space / Asset / FacilityRoomType.
2. Explicit statement that Location Function / Operational Profile / Archetype / OT are **not** forward sources of truth.
3. Mapping of each HIGH dependency (D-OT-01…08, D-OT-14) to its replacement owner.
4. Decision A resolution (or interim: explicit-only with FacilityRoomType deferred).
5. Fail-soft rules: missing optional targeting must not invent overdue/uncovered/missed.
6. Certification checklist inputs for 2D-3.

**Out of scope for 2D-2:** Reader rewires, schema DROP, LF table deletion, ARR-008, EVS execution redesign, Plant WO changes, production deploy, Scheduled Evaluation / Web Push activation.

---

## Success criteria assessment

| Criterion | Status |
|---|---|
| Active LF/OT/profile/archetype consumers traced | **Met** |
| Owning domains identified | **Met** |
| Canonical alternatives verified (not assumed) | **Met** — explicit cycle locations, SPACE attachments, responsibility, FacilityRoomType present |
| Operational targeting semantics preserved in plan | **Met** — Decision A resolved in 2D-2 |
| Historical + auth risks documented | **Met** |
| Controlled sequence produced | **Met** — sequence updated by 2D-2 |
| No app/schema/prod changes | **Met** (docs/ARR only) |

**Gaps (historical at 2D-1 close):** Decision A was open; **closed in 2D-2**. UnitDepartmentResponsibility production occupancy 0 may indicate incomplete Neighborhood responsibility usage (noted, not blocking).

---

## Final audit verdict

**PASS WITH GAPS**

Production is already operating on canonical responsibility + explicit cycle locations with **empty** profile/OT tables, while **~30** significant code dependencies still treat the profile/archetype bus as live. Phase 2D must rehome readers before any schema drop.
