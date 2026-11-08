# Phase 2C-1 — Job Flow consumer audit & canonical re-homing design

**Date:** November 8, 2026  
**Verdict:** **PASS WITH GAPS**  
**Nature:** Implementation design and dependency certification only. **No Job Flow rewrite. No persistence removal.**  
**Checkpoint:** `3de0f41` — Close Location Function and generic Work Plan authoring (Phase 2A/2B)  
**Prior HEAD:** `a881e89` (Phase 0/1 docs)

---

## 1. Baseline

| Item | Result |
|---|---|
| Phase 2A/2B focused hermetics | **81/81 pass** before checkpoint |
| Checkpoint commit | `3de0f415e589da62b7580e8488360f5899323106` |
| Working tree after commit | Clean except untracked `.neon` (excluded) |
| Authoring status | LF writers + Work Plan writers remain retired |

---

## 2. Consumer Dependency Matrix

| Consumer | Path | User-facing behavior | Reads | Writes | Needs published plans? | Needs occurrences? | Proposed owner | Migration approach | Risk | Can retire safely now? |
|---|---|---|---|---|---|---|---|---|---|---|
| Employee Runtime Flow | `employee-runtime-flow/load-flow.ts` → `resolveUnitWorkRequirements` | Employee “my work” list beside Assignment / Cycle / Records | Published `DepartmentWorkPlan` + sparse occurrences | Via separate complete/one-off actions | Soft: empty if none / flag off | Yes for completion state + one-offs | Composition of OR + Records + WO/PM + Assignment | Drop Work contribution after replacements wired; keep empty array progressive | **Critical** | No |
| Flow present / next-action | `present.ts`, `next-action.ts`, `compose.ts` | Labels, hrefs, next Work row | `WorkRequirement[]` | None | Indirect | Indirect | Same | Remove Work presentation branches | High | No |
| Offline serialize | `serialize-offline.ts` | Bundle Work rows for tablet | Flow Work rows | Queued completion commands | Indirect | Yes | Offline adapter per canonical item | Version bundles; reject new Work completions after cutover | High | No |
| Dietary / supervisor Job Flow | `dietary-job-flow/supervisor-operations/load-facts.ts` | Supervisor exceptions / attention for Work | `loadSupervisorWorkExceptions` when workPlans enabled | None in loader | Soft | Yes (exceptions) | Supervisor attention from Records / WO / Coverage gaps | Replace exception feed | High | No |
| Expected Work | `work/expected/load-expected-work.ts` + present | Today’s Work / Dashboard `work.expected` card | `resolveUnitWorkRequirements` + plan count | None | Soft (`hasPublishedWorkPlans`) | Yes | Dashboard cards from canonical due sets | Remove capability when empty; do not invent overdue | High | No |
| Dashboard facts / capabilities | `dashboard/facts.ts`, `capabilities.ts`, `cards/load.ts` | Admits `work.expected` when plans published | Plan presence + Expected Work view | None | Soft | Indirect | Drop `work.expected` after Job Flow Work gone | Capability gate already progressive | Medium | Partially (card can hide) |
| Location sequencing | `scheduling/operational-assignments/location-sequencing.ts` | Orders spaces by incomplete Work | `WorkRequirement[]` | None | Soft | Soft | Sequence by Records due / WO / Assignment | Swap input type | Medium | No |
| Occurrence completion | `occurrence-service.ts` complete / not-required / reopen / reassign | Employee/supervisor mark Work done | Occurrence + requirement | `DepartmentWorkOccurrence` + events | Plan items or one-off | **Yes** | Per-owner completion APIs (Records submit, WO close) | Keep until owners cover; then freeze writers | Critical | No |
| One-off create / cancel | `createOneOff`, staffing operations + work-runtime actions, supervisor panel | Supervisor creates ad-hoc unit Work | Unit / optional employee / Knowledge | Occurrence `sourceKind=ONE_OFF` | **No** | **Yes** | **PO decision** (see §5) | Compatibility retain through 2C-2 early steps | Critical | No |
| Offline space sync | `offline/space/service.ts` | Space-scoped Work complete offline | `resolveUnitWorkRequirements` | `completeExplicit` | Soft | Yes | Per-owner offline commands | Bundle version + reject Work after cutover | Critical | No |
| Offline process-sync | `process-sync-command.ts` `processWorkCompletionCommand` | Device Work completion sync | Payload → synthetic `WorkRequirement` | `completeExplicit` | Flag gate | Yes | Same | Transition / reject rules | Critical | No |
| Staffing operations UI | `/staffing/operations` | Supervisor Work board + one-off | Plans flag + exceptions | Occurrence actions | Soft | Yes | Supervisor Ops from canonical attention | Strip Work sections last | High | No |
| Plant starter install presence | `plant-starter.ts` `loadPlantStarterInstalledKeys` | Detects prior Work preset drafts | `departmentWorkPlan` by presetKey | None (work install throws) | N/A | N/A | Records install keys only | Ignore Work preset keys for “added” | Low | Yes (read-only) |
| Harbor WORK_PRESET browse | `harbor-console/console-catalog*` | Marketplace lists presets | Code presets + usage | None | N/A | N/A | Remove or re-label after presets retired | Hide WORK_PRESET kind | Low | Yes (browse-only) |
| Partner Work page | `/partner/work` | Read-only retired list | Plans | Authors closed 2B | N/A | N/A | Partner OR/Records/Coverage | Keep retired notice | Low | Authors already closed |
| Historical Audit / Reports | Operational Review loaders | Isolation hermetic asserts **no** `resolveUnitWorkRequirements` | Evidence / cycles / etc. | None | No for canonical Review | Legacy Work events only if queried elsewhere | Keep Review free of Work | Do not add Work readers | Low | Already largely clear |
| Runtime Location State | `runtime-location-state/*` | Place board: cycles, records, assets, **Plant WO counts** | Not generic Work Plans | None for Work | No | No | Already canonical | Confirm no re-introduction | Low | **Already unwired** from generic Work |
| Partner runtime views | partner app (excl. `/partner/work`) | No Work Plan resolver found | — | — | — | — | — | Monitor | Low | N/A |

### Progressive configuration (current)

| Missing optional config | Current Job Flow / Expected Work behavior |
|---|---|
| No published Work Plans | `workRequirements` → `[]`; Dashboard omits `work.expected` when `hasPublishedWorkPlans === false` |
| Work plans flag off | Loader skips resolve |
| No Assignment / no unitId | Work resolve skipped (`[]`) |
| No Operating Rhythm | Work items with cycle binding simply do not match windows; no fabricated overdue from empty rhythm alone |
| No Records | Independent of Work path |
| No WO/PM | Independent; RLS already shows WO counts without Work Plans |

**Gap:** Published Work Plans still create due/past-due Work states even when Location Function bindings are missing or places are incomplete — that is retired-indirection debt, not progressive-config success. After Work removal, do not invent replacement overdue from missing Role Job Flow config (Phase 5 remains optional).

---

## 3. Job Flow Composition Contract (approved target)

### Canonical inputs (read-only composition)

1. Employee identity + operational eligibility / qualifications  
2. Scheduled Shift (presence)  
3. Current / upcoming / previous Assignment + place context  
4. Published Operating Rhythm (Cycle / Phase / Key Point) for those places  
5. Due Records (Catalog attachment → requirement → evidence state)  
6. Plant Work Orders + PM occurrences where Department admits Plant  
7. Knowledge / Procedures linked from those items (reference only)  
8. Runtime Location State for assigned / responsible places  
9. Authorized operational exceptions (call-off, offline conflict, coverage gap) that **owners** already publish  

### Item identity

Each Job Flow item MUST carry:

- `ownerKind` + `ownerId` (never a Job-Flow-local id as truth)  
- `facilityId`, `departmentId`, place ids (`unitId` / `spaceId` / `assetId` as applicable)  
- Time semantics owned by the source (dueAt / window / Key Point)  
- Presentation labels derived, not authored, by Job Flow  

### Explicit non-responsibilities

Job Flow MUST NOT:

- Persist a task list, lifecycle, or schedule of its own  
- Author Work Plans, Location Functions, or generic duties  
- Invent overdue/missed/uncovered when optional config is absent  
- Replace Records, WO, OR, or Assignment engines  
- Implement Role Job Flows (Phase 5) or unified timeline (Phase 4) — only leave composition seams  

### Offline & history

- Offline bundles versioned; each command targets a canonical owner API  
- Historical completions remain readable via owner stores (Records, WO events, and **legacy Work occurrence events** until a later approved drop)  
- Unsynchronized Work completion commands: reject with clear reason after cutover; never silent drop without receipt  

### Forward seams

- Phase 4 timeline: compose the same owner events by time  
- Phase 5 Role Job Flows: optional filter/priority over the same composition — not a new store  

---

## 4. Work Re-homing Decision Register (product-owner)

### A. Plant round presets

| Preset | Actual purpose | Candidate owner | Gap vs perfect equivalence |
|---|---|---|---|
| `MECHANICAL_ROOM_ROUND` | Visual walk of mechanical spaces; note follow-ups | **Records** checklist/inspection **or** recurring operational confirmation — **not** PM (preset text rejects PM/regulatory) | Needs place-scoped recurrence without Work Plan; Issue/Request already separate |
| `BUILDING_WALKTHROUGH` | General interior condition observation | Same as above / Operational Request intake | Not compliance inspection |
| `EXTERIOR_GROUNDS_WALKTHROUGH` | Exterior/grounds observation | Same | Not grounds program |
| `GENERATOR_VISUAL_CHECK` | Basic visual check; not load-bank / manufacturer PM | **Records** visual check **≠** PM plan | Explicitly not PM; do not auto-map to Preventive Maintenance |

**Recommendation:** Prefer **Records** (explicit confirmation / linked evidence) for “we walked and confirmed,” with follow-up via existing Request/Issue. Do **not** convert these to PM plans. PO must confirm Records is the intended owner for “rounds that do not create Issues.”

### B. Dietary presets

| Preset | Purpose | Candidate |
|---|---|---|
| `SERVERY_OPENING_CHECKS` / closing / meal support | Cycle-timed checks; some LINKED_EVIDENCE to temp/sanitizer logs | **Records** for evidence steps; OR for timing context only |
| Explicit confirmation steps without evidence | Duty confirmation | **PO:** Records confirmation **or** retire if OR Key Points suffice |

### C. EVS presets

| Preset | Purpose | Candidate |
|---|---|---|
| `ROUTINE_ROOM_CLEAN`, `COMMON_AREA_ROUND` | Cleaning checklists on LF-bound rooms | EVS domain / Records — **PO**; LF targeting must move to place ids |
| `SHIFT_CLOSEOUT` | End-of-shift cart/handoff | Assignment/Coverage handoff **or** Records note — **PO** |
| `ROOM_TURN_SPECIAL_CLEAN` | Ad-hoc room turn | Near **one-off** / Request — **PO** |

### D. One-off supervisor Work — recommendation

| Question | Finding |
|---|---|
| How created? | Supervisor `createOneOff` → `DepartmentWorkOccurrence` `ONE_OFF` (no Work Plan) |
| Assignment? | Optional `assignedEmployeeId`; else unit-shared |
| Needs published plan? | **No** |
| Employee discovery? | Merged into `resolveWorkRequirements` ONE_OFF loop → Job Flow / Expected Work |
| Completion? | Same occurrence completion path as plan-derived Work |
| Offline? | Synced via Work completion commands / space sync |
| History? | Occurrence + `DepartmentWorkEvent` |
| Covered by canonical engines today? | **Partial:** Plant Request/Issue/WO covers maintenance; Records covers documented checks; **no** approved “supervisor ad-hoc duty” owner |

**Recommendation (for PO approval):**

1. **Preferred:** Keep one-off as **temporary compatibility** through Phase 2C-2 until Job Flow no longer lists plan-derived Work; then either  
   - **Retire** one-off if supervisors can use Request/Issue/WO + Records, or  
   - Approve a **narrow Plant/Department operational request** path — **not** a Task engine.  
2. **Do not** invent Task/Activity/Duty.  
3. **Do not** remove runtime one-off in 2C-1 / early 2C-2.

### E. Explicit non-mappings

- Do not map every Work Plan item to Records  
- Do not use Operating Rhythm as a duty list  
- Do not use PM for visual rounds that presets say are not PM  

---

## 5. Offline & historical migration risks

| Risk | Mitigation (design only) |
|---|---|
| Tablets holding Work completion commands | Cutover: accept while dual-read; then reject `WORK_*` with stable reason; never lose receipts |
| Space offline FOR UPDATE on Work tables | Keep locking path until Work complete commands gone |
| Historical occurrences / events | Compatibility readers in Audit if needed; drop only after LEG/drop approval |
| Bundle schema | Bump offline bundle version when Work rows removed from serialize |
| Dashboard `work.expected` | Hide when no plans; remove capability after Job Flow drop |

---

## 6. RLS, Dashboard, Review changes required

| Surface | Required change in 2C-2+ |
|---|---|
| RLS | **None for generic Work** (already unwired). Keep Plant WO/asset facts. |
| Dashboard | Remove `work.expected` admission once Job Flow Work contribution removed; keep progressive empty |
| Review / Audit | Stay free of Work resolvers; optional historical adapter for old occurrences if auditors need them |
| Location sequencing | Swap WorkRequirement input for canonical incomplete items |

---

## 7. Certification debt & authorization

| Issue | Assessment | Resolution path |
|---|---|---|
| `phase6-generic-work-retired.hermetic.test.ts` asserts schema/module absence | **Outdated vs restore (ARR-005)**; “no Work tab” assertion now true | Rewrite tests to “authoring retired / readers compatibility” in 2C-2 or LEG cleanup — **not** by dropping tables in 2C-1 |
| `facility-composition.hermetic.test.ts` | Outdated reader/composition expectations (ARR-004) | Fix expectations or readers in LF reader phase — separate from Job Flow |
| `setEmployeeOperationalQualificationsAction` unlisted in write-manifest | **Real enforce-mode gap.** Action uses `assertCanChangeDepartmentPeople` + Manager password — **authorized in code**, but **unclassified** so manifest test fails and enforce discovery is incomplete | **CDA / write-manifest:** add `src/app/(protected)/employees/qualification-actions.ts` → `setEmployeeOperationalQualificationsAction: department("workforceRecord")` (or owners map matching `assertCanChangeDepartmentPeople`). **Do in a small CDA fix PR**, not buried inside Job Flow rewrite. **Authorization impact:** not a bypass of retired Work; **is** a compliance hole for CDA-D12 discovery. |

---

## 8. Safe Implementation Sequence (Phase 2C-2)

Independently testable steps; stop between for PO decisions A–D:

1. **Classify write-manifest qualification action** (CDA hygiene; unblock enforce noise).  
2. **Introduce Job Flow item DTO** with `ownerKind` (Records | WO | PM | OR KeyPoint | AssignmentException | CompatWork) without removing CompatWork yet.  
3. **Wire Records + WO/PM + OR Key Points** into Employee Runtime Flow compose alongside existing Work array.  
4. **Dashboard:** prefer canonical cards; keep `work.expected` only while CompatWork non-empty.  
5. **Gate plan-derived Work** behind explicit compatibility flag / empty when no published plans (already mostly true).  
6. **PO decision on one-off + Plant rounds** before deleting CompatWork contribution.  
7. **Remove plan-derived Work from Job Flow present/next-action** when replacements certified.  
8. **Retain one-off merge** until PO retires or re-homes.  
9. **Update supervisor operations** exception feed off Work.  
10. **Offline:** stop serializing plan Work; keep one-off if still live; add reject path for Work completions.  
11. **RLS:** confirm still Work-free.  
12. **Review:** optional historical Work occurrence presenter (read-only).  
13. **Remove unused readers** (`loadPublishedWorkPlansForResolve` from Job Flow path).  
14. **Later phase:** schema retirement + drop approval (not 2C-2).  

Do **not** reopen Work Plan or Location Function authoring.

---

## 9. Documentation created

- This file: `docs/architecture/PHASE_2C1_JOB_FLOW_CONSUMER_AUDIT_AND_REHOMING_DESIGN_2026-11-08.md`

Supporting prior:

- `PHASE_2A_LOCATION_FUNCTION_AUTHORING_CLOSED_2026-11-08.md`  
- `PHASE_2B_GENERIC_WORK_AUTHORING_CLOSED_2026-11-08.md`  
- Checkpoint commit `3de0f41`  

---

## 10. Decisions requiring product-owner approval before 2C-2 deletes CompatWork

1. Plant visual rounds → Records (recommended) vs other  
2. Generator visual check stays **out of** PM (recommended)  
3. One-off supervisor Work: temporary compatibility vs retire vs narrow request-like owner  
4. EVS cleaning checklists destination (EVS product vs Records)  
5. Whether historical Work occurrences need Audit UI after Job Flow drops live Work  

**Stop.** Do not implement migration until these are reviewed.
