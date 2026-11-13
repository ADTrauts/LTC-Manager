# Product Constitution Amendment — Phase 1 Architecture Contracts

> **Reading this amendment.** The accepted decisions apply. Implementation, rollout and infrastructure observations below describe their dated checkpoint. Use the [canonical documentation index](../README.md) for current implementation and [01C](01C_PRELAUNCH_CANONICAL_RESET_AMENDMENT_2026-11-10.md) for later decisions.

**Status:** Accepted product-owner architecture amendment (documentation reconciliation)  
**Decision date:** November 8, 2026  
**Audited HEAD:** `e179c0d52dcc3a71d83c8b0a42a1eb00945de6f8`  
**Amends:** [01 — Product Constitution](./01_PRODUCT_CONSTITUTION.md)  
**Extends:** [01A](./01A_DEPARTMENT_BUILDER_FOUNDATION_AMENDMENT_2026-11-01.md), [15A](./15A_DEPARTMENT_BUILDER_REGISTRY_AMENDMENT_2026-11-01.md), [16 — Department Builder](./16_DEPARTMENT_BUILDER_ARCHITECTURE.md)  
**Discovery:** [Phase 0 Architecture Pack](../architecture/PHASE_0_README.md)  
**Phase 1 report:** [PHASE_1_ARCHITECTURE_CONTRACTS_RECONCILIATION_2026-11-08.md](../architecture/PHASE_1_ARCHITECTURE_CONTRACTS_RECONCILIATION_2026-11-08.md)

This amendment reconciles governing documentation with the November 1–2 decisions and the November 6 compatibility restore. It does **not** authorize Phase 2 code removal, timeline implementation, Role Job Flows, Scheduled Evaluation host activation, or Web Push production sending.

Where older Constitution, Domain Model, Registry, Language Guide, Product, Build/Run, or agent-instruction paragraphs still teach generic Work, Location Function / Department profile, or Department Job Role as forward architecture, **this amendment wins**.

---

## Amendment A — Four architectural states

Every major capability in governing docs must be described with one of these states:

| State | Meaning |
|---|---|
| **Implemented and verified** | Current code supports the documented contract, with appropriate tests or certification evidence for the claimed behavior |
| **Implemented with gaps** | Correct architecture exists in code, but activation, host scheduling, flags, or integration are incomplete |
| **Approved target** | Accepted design; not completed in application code |
| **Retired or compatibility-only** | Remaining schema, routes, or services exist only for transitional compatibility or traced removal |

Rules:

- A historical green test does not prove a model is absent after the November 6 restore.
- Schema presence does not prove a completed forward feature.
- An implemented Scheduled Evaluation evaluator does not prove a verified production scheduler.
- Live bind/publish UI for a retired concept is compatibility debt, not authorized future behavior.

---

## Amendment B — November 6 restore is temporary compatibility

Migration `20261106214500_restore_schema_after_premature_retirement` (commit `e179c0d`) recreated structures that November 3–4 retirement work had removed, because production still required them while application code still referenced them.

| Fact | Status |
|---|---|
| Architecture intent (Nov 1–2) | Generic Work, Location Function / profile / archetype, and Department Job Role remain **retired** |
| Implementation at audited HEAD | Those models and many consumers are **present again** |
| Meaning of the restore | **Compatibility debt**, not architecture reversal |
| Phase 1 action | Document truth; do not delete code or tables |
| Phase 2 action | Trace readers/writers, re-home valid behavior, remove safely with forward-only migrations |

Do not describe Work Plans, profiles, archetypes, or Job Roles as “successfully deleted” while they exist in `prisma/schema.prisma` and live modules.

---

## Amendment C — Forward shared mechanisms (post–Nov 1–2)

Every installed Department receives these shared Platform mechanisms:

- one physical Facility tree and Department responsibility
- Operating Rhythm (Operational Cycle → Phase → Key Point)
- one Records Catalog chain
- shared Assets and Facility Plant Operations maintenance capabilities where installed
- People / Teams / Shift / Assignment / Coverage
- Job Flow as a **composition** (stores nothing)
- Notifications & Attention (one engine)
- Facility-local Operational Time and one Scheduled Evaluation clock

**Not** forward shared mechanisms:

- generic Department Work Plans / Expected Work / Work occurrences / Work presets
- Location Function, Operational Type, `DepartmentRoomArchetype`, or `DepartmentOperationalProfile` as Department room classification
- Department Job Role capability packages beside Employee Builder + operational qualifications
- a Task / Activity / Duty / Routine catch-all replacing Work
- a second notification engine, location tree, Cycle engine, Records engine, or Catalog

Marketplace forward kinds remain Records forms, Operating Rhythm starters, and Menu templates. **Work presets are not a forward Marketplace kind.** Code may still ship legacy Work presets until Phase 2 removes them; Phase 1 does not change registry runtime strings.

---

## Amendment D — Department Builder contract

Department Builder standard sections:

1. Overview  
2. Facility (canonical URL/tab may still say Locations)  
3. Operating Rhythm  
4. People & Coverage  
5. Records  

Approved Product extensions:

- Food and Nutrition → Menus  
- Facility Plant Operations → Preventive Maintenance  

**Work is not a core section.** Live Work tabs, `/staffing/work-plans`, `/partner/work`, and Harbor work-preset pages are **retired or compatibility-only**.

**Location Function authoring is not approved.** Live Locations bind/publish actions are **compatibility debt** (Phase 0 ARR-026). Facility Builder owns places and responsibility. Engines store canonical Unit / UnitSpace ids.

Composition rule unchanged: display may compose; editing follows ownership.

---

## Amendment E — Workforce ownership

Keep these facts distinct:

| Fact | Owner |
|---|---|
| Platform authorization | RoleKey + `UserFacilityRolePeriod` |
| HR title | `JobTitle` / Employee Builder |
| Department membership | Employee Builder |
| Team organization | Employee Builder (`DepartmentTeam`) |
| Operational eligibility | `EmployeeOperationalRoleQualification` + `OPERATIONAL_ROLE_REGISTRY` |
| Daily placement / role covered | `OperationalAssignment.roleKey` (+ snapshot label) |
| Coverage need | Coverage templates (Department Builder → People & Coverage) |

**Department Job Role** (`DepartmentJobRole` / capabilities) remains **retired**. Residual tables and `/employees/job-roles` are compatibility debt after the restore (ARR-008 / ARR-024).

Future optional Role Job Flows (program Phase 5) are an **Approved target** composition over these facts. They are not implemented and must not invent a new role/capability system.

---

## Amendment F — Progressive configuration (formal platform principle)

An installed Department must not require every optional feature before unrelated capabilities can run.

| Configuration state | Meaning |
|---|---|
| **Not configured** | Optional capability has no published/active configuration |
| **Not applicable** | Capability does not apply to this Product, place, or principal |
| **Unavailable** | Capability exists but is gated (release status, flag, authority, host clock) |
| **Configured but incomplete** | Draft or partial setup; Run must not invent completed truth |
| **Operational exception** | A real miss, overdue, uncovered, out-of-standard, or outage against configured expectation |

**Rule:** Absent optional configuration must not fabricate missed work, overdue work, failed compliance, or uncovered staffing.

Examples (intended):

| Absent optional config | Intended behavior |
|---|---|
| No published Operating Rhythm | No “happening now” window (`NOT_CONFIGURED`); do not guess meal times |
| No coverage expectations | No Coverage deficiency episodes from that absence |
| No Role Job Flow (future) | Default Job Flow / place context still usable when otherwise authorized |
| No Records attachments for a place | No due Records for that place; not overdue |
| No Preventive Maintenance plan | No PM occurrences; not a Rhythm overdue |
| No Menus | No applicable menu; Cycle timing unchanged |
| No push / email channels | In-app attention may still exist; external delivery stays off |

Genuine prerequisites remain (authorization, facility tenancy, installed Department where required, data integrity). Progressive configuration does not weaken safety or authority.

Documented Phase 0 graceful-degradation evidence lives in the [Temporal Audit](../architecture/PHASE_0_TEMPORAL_ARCHITECTURE_AUDIT_2026-11-08.md) and [Atlas](../architecture/PHASE_0_PLATFORM_ARCHITECTURE_ATLAS_2026-11-08.md).

---

## Amendment G — Temporal foundation

| Layer | Role |
|---|---|
| `src/lib/operational-time` | Facility timezone, civil service date, local wall-clock ↔ UTC |
| Domain owners | Rhythm windows, Shift/Assignment, Coverage periods, Records due windows, WO deadlines, PM recurrence |
| `src/lib/scheduled-evaluation` | Asks domains whether time passing changed a fact; does not own the fact |
| Future unified timeline | **Projection** of domain facts — Approved target, not a truth store |
| Future calendar | **Consumer** of that projection — not an alternative scheduler |

Preserve domain-specific recurrence. Do not add a second global operational clock.

**Implemented with gaps:** Scheduled Evaluation evaluators exist; `/api/internal/scheduled-evaluation` exists; **`vercel.json` does not register that path** at audited HEAD. Production clock remains inactive until a later host authorization. Web Push sending stays off.

**Phase 3 implementation findings (not fixed in Phase 1):**

- ARR-027 — inspection `facilityLocalDateTimeToUtc` DST policy diverges from Operational Time  
- ARR-028 — `employee-units.ts` uses process-local midnight instead of facility service date  

---

## Amendment H — Builder → engine ownership (summary)

| Surface | Owns | Reads / composes only |
|---|---|---|
| Facility Builder | Physical tree, room types, Department responsibility | — |
| Department Builder | Rhythm, Coverage needs, Records placement (via Records section), Product extensions | Facility places; People organization; Overview summaries |
| Employee Builder | Employee identity, membership, Teams, HR, operational qualifications | Schedule labels; not Coverage need; not Assignment |
| Records / Logs Builder | Catalog install + LogAttachment | Harbor definitions |
| Asset Builder | Asset identity / location / responsibility / criticality | Condition and repairs stay in RUN |
| Menu Builder | Menu identity/content/applicability | Cycle definition stays on Rhythm |
| Procedures & Resources | Facility knowledge articles | Harbor procedures via Catalog/Logs |
| Plant PM extension | PM plans/versions | Generated Work Orders remain `Repair` |

Run compositions (Dashboard, Job Flow, Runtime Location State, Notification Center) own no operational stores. Audit reconstructs expected vs actual from historically effective owner configuration.

---

## Amendment I — Product registry commercial strings (Phase 2 code, not Phase 1)

Phase 1 does **not** change `src/lib/department-products/registry.ts` runtime values.

Approved replacements for Phase 2 code:

| Current registry language (compatibility) | Approved forward language |
|---|---|
| Customer capability “Location Functions” | Remove; speak Facility responsibility + canonical places |
| Customer capability / starter “Work” / `workPresets` | Remove; do not replace with Task/Activity |
| Plant copy “recurring operational Work” | Prefer Records rounds / PM / Work Orders as applicable |
| `jobRoleTiers: "generic"` | Remove with Job Role retirement; eligibility uses qualifications |

---

## Amendment J — Coding-agent safeguards

Agents must:

1. Consult [15](./15_PLATFORM_PRIMITIVES_AND_ENGINES_REGISTRY.md) + this amendment before new storage or engines.  
2. Reuse Operational Time, Scheduled Evaluation, Records, Facility tree, workforce facts, and Notifications.  
3. Never revive generic Work, Location Function, or Department Job Role as forward design.  
4. Distinguish Implemented / gaps / Approved target / Retired-compatibility.  
5. Keep Build, Run, and Audit separate; screens compose.  
6. Preserve progressive configuration.  
7. Use forward-only migrations; never edit applied migrations or reset DBs without explicit opt-in.  
8. Stop for product-owner approval on major changes (new engine, new home, who runs a Department, Marketplace/Console meaning).

Detailed agent text lives in `AGENTS.md` and `.cursor/rules/vssyl-foundation.mdc`.
