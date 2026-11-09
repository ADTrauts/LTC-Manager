# Phase 0 — Architecture Reconciliation Register

**Status:** Phase 0 discovery deliverable. Documentation only. No schema or application changes authorized by this file.  
**Audit date:** November 8, 2026  
**Commit SHA:** `e179c0d52dcc3a71d83c8b0a42a1eb00945de6f8`  
**Companions:** [Atlas](./PHASE_0_PLATFORM_ARCHITECTURE_ATLAS_2026-11-08.md), [Temporal Audit](./PHASE_0_TEMPORAL_ARCHITECTURE_AUDIT_2026-11-08.md)  
**Phase 1:** Documentation reconciliation recorded in [PHASE_1 report](./PHASE_1_ARCHITECTURE_CONTRACTS_RECONCILIATION_2026-11-08.md) and [01B](../product/01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md). Doc-only findings (ARR-001 narrative, ARR-005/007/019/020/024/029 documentation sides, ARR-006 planned string replacements) are clarified there; **code findings are not marked resolved**.

### Finding categories

- **Confirmed architectural conflict** — accepted decision vs live behavior disagree
- **Implementation gap** — accepted design exists; wiring/host/flag incomplete
- **Documentation drift** — docs disagree with each other or with code
- **Legitimate domain-specific design** — intentional separation; not duplication
- **Legacy/deletion debt** — retired concept still present pending traced removal
- **Future enhancement** — approved direction, not required for current correctness

### Risk levels

`Critical` · `High` · `Medium` · `Low`

### Proposed phases

Refer to Phase 0–7 program; findings do **not** authorize those phases.

---

## Finding index

| ID | Title | Category | Risk | Proposed phase |
|---|---|---|---|---|
| ARR-001 | Premature Work/profile retirement restored into live schema | Confirmed conflict | Critical | 1 → 2 |
| ARR-002 | Department Builder Work tab — **authoring/nav closed Phase 2B** | Closed (authoring/nav) | Critical → mitigated | 2B done |
| ARR-003 | Job Flow still depends on generic Work — **2C final cert: forward presentation retired; ONE_OFF/offline/schema remain** | Mitigated presentation; compatibility open | High | Deploy / device / schema |
| ARR-004 | Location Function / profile / archetype schema + readers remain (writers closed in 2A) | Legacy debt + conflict | Critical | 2 |
| ARR-005 | Phase 6 retirement tests assert gone objects that exist again | Documentation/test drift | High | 1 → 2 |
| ARR-006 | Product registry still sells Work and Location Functions | Documentation drift | High | 1 |
| ARR-007 | Constitution / Domain Model long-form still name retired owners | Documentation drift | High | 1 |
| ARR-008 | Department Job Role restored beside operational qualifications | Confirmed conflict | High | 2 |
| ARR-009 | Scheduled Evaluation production clock not hosted | Implementation gap | High | 3 / 6 |
| ARR-010 | Web Push production sending intentionally off | Implementation gap | Medium | 6 |
| ARR-011 | `CANONICAL_LOGS_ENABLED` default false | Implementation gap / rollout | Medium | 2 / 7 |
| ARR-012 | Independent PM cron beside Scheduled Evaluation | Legitimate design | Low | — |
| ARR-013 | Marketplace kinds beyond Records forms not built | Future enhancement | Medium | Future |
| ARR-014 | EVS DEVELOPMENT vs shared engine surfaces | Legitimate + gap | Medium | Product release |
| ARR-015 | Partner/staffing Work Plan authoring — **closed Phase 2B**; routes read-only | Closed (writers) | Medium → mitigated | 2B done |
| ARR-016 | Runtime Location State still carries operational-type sidecars | Legacy debt | High | 2 |
| ARR-017 | Multiple Records due calculators | Legitimate design | Low | 4 projection only |
| ARR-018 | Historical Operational Type selectors in Review | Legacy debt | Medium | 2 |
| ARR-019 | Build hub copy still teaches Work | Documentation drift | Medium | 1 |
| ARR-020 | Location Function elimination audit “tables gone” stale after restore | Documentation drift | High | 1 |
| ARR-021 | CDA write-manifest default flag false in code | Implementation gap | Medium | CDA program |
| ARR-022 | Unified timeline / Role Job Flows not built | Future enhancement | Medium | 4–5 |
| ARR-023 | Experience / Operational Area projection leftovers | Legacy debt | Medium | 2 |
| ARR-024 | Nov 4 eligibility doc vs restored Job Role tables | Documentation drift | High | 1 → 2 |
| ARR-025 | Operations Engine retired successfully (positive control) | Legitimate / complete | Low | — |
| ARR-026 | Department Locations LF bind/publish — **authoring closed Phase 2A** | Closed (writers) | Critical → mitigated | 2A done |
| ARR-027 | Inspection due-at DST policy diverges from Operational Time | Confirmed conflict | Medium | 3 |
| ARR-028 | `employee-units` uses server-local midnight for “today” | Implementation gap | Medium | 3 |
| ARR-029 | Facility-composition vs Locations panel LF writes — **reconciled Phase 2A** | Closed (authoring) | High → mitigated | 2A done |

---

## Findings

### ARR-001 — Premature Work/profile retirement restored

| Field | Content |
|---|---|
| Affected domain | Generic Work; Location Function / Department profile |
| Code evidence | Migration `20261103140000_retire_generic_work_and_profiles`; restore `20261106214500_restore_schema_after_premature_retirement`; HEAD commit `e179c0d` message: restore objects still required by running app; schema still has `DepartmentWorkPlan*`, `DepartmentOperationalProfile`, `DepartmentRoomArchetype*` |
| Governing decision | [01A](../product/01A_DEPARTMENT_BUILDER_FOUNDATION_AMENDMENT_2026-11-01.md), [16](../product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md), [Work retirement](../legacy-retirement/DEPARTMENT_WORK_RETIREMENT_2026-11-01.md) |
| Current vs expected | Expected: retired before release. Current: schema + app paths live again after empty recreate. **2C-2G-1:** Production (`ltc-manager` Neon) has retire+restore applied and Work tables empty (empty recreate). Local still has retire applied / restore pending. Staging never applied retire/restore and remains migration-behind. Restore does not recover dropped rows. |
| Risk | Critical — dual architecture; future drops unsafe without re-trace; local/staging hygiene lag; historical Work rows on production lost at retire unless backup/PITR exists |
| Recommended action | Treat restore as emergency compatibility. Re-run full reader/writer trace before any new drop. Do not edit applied migrations. Remediate lagging DBs only when explicitly authorized. Treat pre-restore Work data recovery as a separate ops question |
| Dependencies | ARR-002, ARR-003, ARR-004, ARR-005 |
| Proposed phase | Phase 1 (document truth) then Phase 2 (traced removal) |
| Verification needed | Inventory every Prisma client access to restored models; [2C-2G-1 gate](./PHASE_2C2G1_DATABASE_INTEGRITY_AND_CUTOVER_GATE.md) verified production Work occupancy = 0 |

### ARR-002 — Department Builder Work tab still live

| Field | Content |
|---|---|
| Affected domain | Department Builder |
| Code evidence | **Closed Phase 2B (2026-11-08):** `work` removed from `DEPARTMENT_ADMIN_TABS`; retired redirect → overview; page no longer mounts authoring panel; `workEnabled` ignored. See [PHASE_2B_GENERIC_WORK_AUTHORING_CLOSED_2026-11-08.md](./PHASE_2B_GENERIC_WORK_AUTHORING_CLOSED_2026-11-08.md) |
| Governing decision | 16 § Retired core section; 01A Amendment D |
| Current vs expected | Expected: no Work section. **Nav/authoring closed.** Job Flow still reads plans (ARR-003) |
| Risk | Critical authoring/nav **closed**; runtime reader risk remains ARR-003 |
| Recommended action | ~~Remove tab~~ Done. Proceed to Phase 2C Job Flow rewiring before schema drop |
| Dependencies | ARR-001, ARR-003 |
| Proposed phase | 2 — **authoring/nav complete (2B)** |
| Verification needed | Phase 2B hermetics; partner/work; staffing/work-plans retired pages |

### ARR-003 — Job Flow depends on Work Plans

| Field | Content |
|---|---|
| Affected domain | Job Flow / Employee Runtime Flow |
| Code evidence | Phase 2C implementation complete through 2H-3 at `0d706e6`. Final integration cert: [PHASE_2C_FINAL_INTEGRATION_CERTIFICATION.md](./PHASE_2C_FINAL_INTEGRATION_CERTIFICATION.md) — **PASS WITH GAPS / CONDITIONAL**. Forward presentation consumers reconciled; ONE_OFF + offline commands + historical readers + Prisma Work models remain. Authoring closed (2B). |
| Governing decision | Foundation: Job Flow composes Assignment, Cycle, Records, WO/PM; 15A: must not require generic Work going forward |
| Current vs expected | Expected: composition without generic Work. Current: **forward plan-derived presentation retired (hermetic certified)**; browser/offline device cert pending; schema persistence outstanding. Deploy not authorized. |
| Risk | Device/browser certification and schema retirement debt; presentation conflict mitigated |
| Recommended action | Deploy only after CONDITIONAL gates; retain one-off; keep completion receipts; do not drop schema yet; optional EVS canonical sequencing decision |
| Dependencies | ARR-001, ARR-002 (authoring closed) |
| Proposed phase | Deploy / device / schema — **ARR-003 not closed** (forward retirement vs schema retirement distinguished) |
| Verification needed | Deploy approval; browser/offline smoke; CDA qualifications manifest classification; optional Harbor SQL on disposable DB |

### ARR-004 — Location Function / profile / archetype remain

| Field | Content |
|---|---|
| Affected domain | Facility composition; Cycles/Records/Coverage historical paths; product starters |
| Code evidence | Schema models present; `location-functions.ts` exists; ~144 src files match archetype/profile/operational-type patterns; admin-nav Locations description still says Location Functions; Menu applicability still consults active Operational Profile + archetype bindings (`menu-applicability-db.ts`) |
| Governing decision | 01A Amendment B (Nov 2 supersession); 16 §4.3–4.4; elimination audit |
| Current vs expected | Expected: engines store canonical place ids only; no function key. Current: tables restored; many references remain; **authoring writes still live** (see ARR-026) |
| Risk | Critical |
| Recommended action | Continue explicit-id path; delete writers first, then readers, then tables; do not add new function-key APIs |
| Dependencies | ARR-001, ARR-016, ARR-018, ARR-023, ARR-026, ARR-029 |
| Proposed phase | 2 |
| Verification needed | Cycle applicability, Records attach, Coverage templates, Menu runtime, RLS compose, Locations panel |

### ARR-005 — Phase 6 tests vs restored schema

| Field | Content |
|---|---|
| Affected domain | Certification evidence |
| Code evidence | `phase6-generic-work-retired.hermetic.test.ts` asserts Work/profile models absent and `src/lib/department-work` gone; both exist on HEAD |
| Governing decision | Retirement decision + restore commit reality |
| Current vs expected | Tests encode target; tree encodes restore |
| Risk | High — false confidence or red suite |
| Recommended action | Split “architecture intent” tests from “current compatibility” tests after Phase 1 wording; do not delete evidence of intent |
| Dependencies | ARR-001 |
| Proposed phase | 1–2 |
| Verification needed | Run that hermetic file on HEAD and record outcome |

### ARR-006 — Product registry customerCapabilities drift

| Field | Content |
|---|---|
| Affected domain | Department Product commercial/customer copy |
| Code evidence | F&N `customerCapabilities` includes “Location Functions” and “Work”; starters `workPresets: true`; Plant shortDescription mentions recurring operational Work |
| Governing decision | 01A / 15A Marketplace without Work presets; Location Function retired |
| Current vs expected | Registry teaches retired capabilities |
| Risk | High |
| Recommended action | Update registry copy and starter refs only when Work removal lands or behind explicit transitional notes in Phase 1 docs |
| Dependencies | ARR-001 |
| Proposed phase | 1 (docs) / 2 (code registry) |
| Verification needed | Marketplace UI snapshots; final-release-gate tests |

### ARR-007 — Constitution / Domain Model stale ownership rows

| Field | Content |
|---|---|
| Affected domain | Architecture authority prose |
| Code evidence | Constitution shared mechanisms and Domain Model ownership still list Location Function and Work Plan ownership rows |
| Governing decision | 01A says long-form should be reconciled when retirement performed; until then amendment wins |
| Current vs expected | Readers of Domain Model alone will implement retired design |
| Risk | High |
| Recommended action | Phase 1 textual reconciliation — **requires PO approval** to edit canonical docs |
| Dependencies | ARR-001 |
| Proposed phase | 1 |
| Verification needed | Cross-link amendments in README / AGENTS if needed without widening scope |

### ARR-008 — Department Job Role vs qualifications

| Field | Content |
|---|---|
| Affected domain | People / workforce identity |
| Code evidence | `DepartmentJobRole` / `EmployeeDepartmentJobRole` in schema; `src/lib/department-job-roles/*`; `/employees/job-roles`; restore migration recreates job-role enums; also `EmployeeOperationalRoleQualification` (+ e16205a) and `employee-operational-qualifications` |
| Governing decision | 01A Amendment C; OPERATIONAL_ELIGIBILITY.md Phase 7B removal of Job Role; keep qualifications + registry roles |
| Current vs expected | Expected: Job Role gone. Current: both systems present |
| Risk | High — duplicate role identity |
| Recommended action | Trace schedule label readers; retire Job Role UI/services again without dropping qualifications |
| Dependencies | ARR-001 restore bundle |
| Proposed phase | 2 |
| Verification needed | Assignment eligibility tests; employee organization sync |

### ARR-009 — Scheduled Evaluation not on host cron

| Field | Content |
|---|---|
| Affected domain | Coverage time, KP overdue, WO overdue, escalation, push delivery |
| Code evidence | `vercel.json` only support + PM; route + registry exist; tests assert cron omitted |
| Governing decision | Notifications architecture: production scheduler blocked until sub-hour cron accepted |
| Current vs expected | Code ready; production clock inactive |
| Risk | High for time-shaped attention; write-driven attention can still work |
| Recommended action | PO + hosting decision; then register cron; certify leases |
| Dependencies | ARR-010 |
| Proposed phase | 3 foundation polish, 6 activation |
| Verification needed | Staging cron invocation logs; reliability db tests |

### ARR-010 — Web Push sending off

| Field | Content |
|---|---|
| Affected domain | Notifications external delivery |
| Code evidence | `WEB_PUSH_SENDING_ENABLED` exact `"true"` gate in push-dispatch; N5 docs |
| Governing decision | Push off until clock + sign-out safety certified |
| Current vs expected | Correct intentional gap |
| Risk | Medium |
| Recommended action | Keep off; do not bypass with page-open sends |
| Dependencies | ARR-009 |
| Proposed phase | 6 |
| Verification needed | N5 certification artifacts already documented |

### ARR-011 — Canonical Logs flag default false

| Field | Content |
|---|---|
| Affected domain | Records |
| Code evidence | `feature-flags.ts` `CANONICAL_LOGS_ENABLED` default false; LEG tracker says forward default on for seeds/example |
| Governing decision | One Catalog chain is forward; legacy surfaces retired |
| Current vs expected | Environments may still run non-forward paths if flag unset |
| Risk | Medium |
| Recommended action | Treat production enablement as release checklist item; do not add second engine |
| Dependencies | First-customer runbook |
| Proposed phase | 7 / launch |
| Verification needed | Per-environment flag audit |

### ARR-012 — PM daily cron vs Scheduled Evaluation

| Field | Content |
|---|---|
| Affected domain | Preventive Maintenance vs attention clock |
| Code evidence | Distinct routes and purposes |
| Governing decision | Registry: domain recurrence OK; no second operational-time cron for attention |
| Current vs expected | Correct separation |
| Risk | Low |
| Recommended action | Preserve; document in temporal atlas (done) |
| Dependencies | None |
| Proposed phase | — |
| Verification needed | None beyond awareness |

### ARR-013 — Marketplace item kinds incomplete

| Field | Content |
|---|---|
| Affected domain | Marketplace |
| Code evidence | Only Records forms are Catalog items; Work presets / rhythm starters / menu templates still code-shipped |
| Governing decision | Oct 20 foundation; Work presets removed from forward Marketplace language by Nov 1 |
| Current vs expected | Partial Marketplace |
| Risk | Medium commercially; not a runtime correctness bug |
| Recommended action | Extend Catalog kinds later without second catalog; exclude Work presets |
| Dependencies | ARR-006 |
| Proposed phase | Future after Phase 2 |
| Verification needed | Catalog schema capability for new kinds |

### ARR-014 — EVS DEVELOPMENT

| Field | Content |
|---|---|
| Affected domain | Department Products |
| Code evidence | Registry status DEVELOPMENT; shared engines usable internally |
| Governing decision | Customer visibility requires AVAILABLE |
| Current vs expected | Aligned |
| Risk | Medium product; Low architecture |
| Recommended action | No architecture change |
| Dependencies | Release certification |
| Proposed phase | Product release, not Phase 0–7 structural |
| Verification needed | Marketplace hiding tests |

### ARR-015 — Partner work + staffing work-plans surfaces

| Field | Content |
|---|---|
| Affected domain | Generic Work consumers |
| Code evidence | **Closed Phase 2B:** staffing + partner plan create/publish actions return `GENERIC_WORK_AUTHORING_RETIRED`; pages are retired read-only; Build Home card and BUILD nav label removed. Harbor WORK_PRESET catalog browse remains read-only (preset metadata). Occurrence runtime actions intentionally retained |
| Governing decision | Work retirement |
| Current vs expected | **Authoring closed.** Routes remain as retired/read-only until ARR-003 clears readers |
| Risk | Authoring risk **mitigated**; Harbor browse still lists preset metadata (compatibility) |
| Recommended action | ~~Close writers~~ Done. Remove Harbor WORK_PRESET browse after 2C if unused |
| Dependencies | ARR-002, ARR-003 |
| Proposed phase | 2 — **authoring complete (2B)** |
| Verification needed | Phase 2B hermetics; partner work actions |

### ARR-026 — Locations still writes Location Function bind/publish

| Field | Content |
|---|---|
| Affected domain | Department Builder → Locations / Facility lens |
| Code evidence | **Closed Phase 2A (2026-11-08):** `locations-panel.tsx` no longer mounts bind/publish; `actions.ts` + `profile-service` LF/OT/archetype writers return/throw `LOCATION_FUNCTION_AUTHORING_RETIRED`; write-manifest classifies those actions `LEGACY`. See [PHASE_2A_LOCATION_FUNCTION_AUTHORING_CLOSED_2026-11-08.md](./PHASE_2A_LOCATION_FUNCTION_AUTHORING_CLOSED_2026-11-08.md) |
| Governing decision | 16 §4.3–4.4 — Facility section must not author Location Function; Facility authoring path closed in Phase 5B narrative |
| Current vs expected | Expected: composition-only over responsibility. **Authoring closed.** Readers/schema remain (ARR-004) |
| Risk | Critical authoring path **closed**; residual reader risk tracked under ARR-004 |
| Recommended action | ~~Close write path~~ Done. Keep read composition of responsibility + other owners until ARR-004 |
| Dependencies | ARR-004, ARR-029 |
| Proposed phase | 2 — **authoring complete (2A)** |
| Verification needed | ~~Locations UI hermetic; facility-composition vs locations-panel conflict~~ Phase 2A hermetics pass |

### ARR-027 — Inspection due-at DST policy diverges from Operational Time

| Field | Content |
|---|---|
| Affected domain | Temporal primitives / legacy inspection scheduling |
| Code evidence | `work/inspections/facility-local-due-at.ts` advances one hour and retries on spring-forward gaps; `operational-time` `parseFacilityLocalScheduledStartOnDate` keeps first approximation for nonexistent times |
| Governing decision | One Operational Time primitive; domains wrap it |
| Current vs expected | Same civil `02:30` can resolve differently |
| Risk | Medium |
| Recommended action | Phase 3: make inspection helper call Operational Time or adopt one documented DST policy; do not invent a third parser |
| Dependencies | ARR-011 if inspections still on legacy path |
| Proposed phase | 3 |
| Verification needed | Align `inspection-scheduling.test.ts` with `operational-time.test.ts` spring-forward cases |

### ARR-028 — `employee-units` server-local midnight

| Field | Content |
|---|---|
| Affected domain | Employee unit access / “today” shift scoping |
| Code evidence | `src/lib/employee-units.ts` uses `start.setHours(0, 0, 0, 0)` (process-local), not `getFacilityServiceDate` / Operational Time |
| Governing decision | Facility-local service date is operational authority |
| Current vs expected | Near TZ boundaries, “today” can disagree with Facility civil day |
| Risk | Medium |
| Recommended action | Phase 3: replace with facility service-date window |
| Dependencies | Operational Time |
| Proposed phase | 3 |
| Verification needed | Unit near-midnight fixtures across US zones |

### ARR-029 — Facility-composition tests vs Locations panel

| Field | Content |
|---|---|
| Affected domain | Certification evidence for LF elimination |
| Code evidence | **Closed Phase 2A (2026-11-08):** `locations-panel.tsx` no longer matches Location Function bind/publish; facility-composition panel authoring assertion now agrees. Remaining facility-composition failures are reader/composition expectations (ARR-004), not authoring |
| Governing decision | Elimination audit Phase 5B / 16 Facility composition |
| Current vs expected | **Authoring conflict resolved.** Reader composition assertions may still fail independently |
| Risk | Authoring false-confidence risk **closed** |
| Recommended action | ~~Reconcile panel~~ Done for authoring. Track reader assertions under ARR-004 |
| Dependencies | ARR-026 |
| Proposed phase | 2 — **authoring complete (2A)** |
| Verification needed | Phase 2A + facility-composition panel assertion |

### ARR-016 — Runtime Location State operational-type sidecars

| Field | Content |
|---|---|
| Affected domain | Run composition |
| Code evidence | `runtime-location-state/compose.ts` imports cycle/coverage matchers historically tied to operational types; related hermetic fixtures still mention keys |
| Governing decision | Explicit place ids; RLS composes owners only |
| Current vs expected | Should not need function keys |
| Risk | High if matchers still expand keys |
| Recommended action | Verify matchers fail-closed on OPERATIONAL_TYPE; remove sidecar fields |
| Dependencies | ARR-004 |
| Proposed phase | 2 |
| Verification needed | runtime-location-state hermetic suite |

### ARR-017 — Multiple due-status calculations

| Field | Content |
|---|---|
| Affected domain | Records, WO, KP, Coverage |
| Code evidence | Separate due modules per owner |
| Governing decision | Domains own due truth; Notifications do not |
| Current vs expected | Correct |
| Risk | Low |
| Recommended action | Timeline projects; does not merge calculators |
| Dependencies | Phase 4 |
| Proposed phase | 4 |
| Verification needed | None as conflict |

### ARR-018 — Historical Operational Type in Review

| Field | Content |
|---|---|
| Affected domain | Audit / Reports |
| Code evidence | `operational-review/historical-operational-type.ts` and related composers |
| Governing decision | No released question needs historical function key |
| Current vs expected | Label debt |
| Risk | Medium |
| Recommended action | Remove after UI stops displaying key |
| Dependencies | ARR-004 |
| Proposed phase | 2 |
| Verification needed | Review hermetic tests |

### ARR-019 — Build hub teaches Work

| Field | Content |
|---|---|
| Affected domain | Build IA copy |
| Code evidence | `build-hub.ts` Department Builder description lists Work; `/staffing/work-plans` card copy |
| Governing decision | 16 Department Builder contract |
| Current vs expected | Copy drift |
| Risk | Medium |
| Recommended action | Update with Phase 1/2 |
| Dependencies | ARR-002 |
| Proposed phase | 1–2 |
| Verification needed | Build hub tests |

### ARR-020 — Elimination audit status paragraph stale

| Field | Content |
|---|---|
| Affected domain | Architecture documentation |
| Code evidence | `08_LOCATION_FUNCTION_ELIMINATION_AUDIT.md` “Current state (November 4)” claims profiles/archetypes/Work gone; HEAD restore contradicts |
| Governing decision | Live schema + amendments |
| Current vs expected | Doc over-claims completion |
| Risk | High misguidance |
| Recommended action | Phase 1 annotate audit with restore supersession note (PO-approved doc edit) |
| Dependencies | ARR-001 |
| Proposed phase | 1 |
| Verification needed | Doc review only |

### ARR-021 — CDA flag default false

| Field | Content |
|---|---|
| Affected domain | Contracted Department Authority |
| Code evidence | `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED` default false; AGENTS notes production project sets true |
| Governing decision | CDA program |
| Current vs expected | Code safe default; prod override |
| Risk | Medium if env mis-set |
| Recommended action | Keep; verify launch checklist |
| Dependencies | Launch runbook |
| Proposed phase | CDA / launch |
| Verification needed | Env audit |

### ARR-022 — Unified timeline and Role Job Flows absent

| Field | Content |
|---|---|
| Affected domain | Future program Phases 4–5 |
| Code evidence | No timeline projection module; Job Flow is department/employee scoped, not optional role-flow config engine |
| Governing decision | Not yet authorized beyond Phase 0 discovery |
| Current vs expected | Correct absence |
| Risk | Medium if built early on Work |
| Recommended action | Wait for Phase 2–3 prerequisites |
| Dependencies | ARR-003, ARR-009 |
| Proposed phase | 4–5 |
| Verification needed | Design approval |

### ARR-023 — Experience / Operational Area leftovers

| Field | Content |
|---|---|
| Affected domain | Projection / Facility programming |
| Code evidence | Schema Experience/Area models restored; projection / experiences modules |
| Governing decision | 16 Amendment F; not forward |
| Current vs expected | Deletion debt |
| Risk | Medium |
| Recommended action | Remove with profile retirement trace |
| Dependencies | ARR-004 |
| Proposed phase | 2 |
| Verification needed | Projection pipeline tests |

### ARR-024 — Eligibility doc vs restored Job Roles

| Field | Content |
|---|---|
| Affected domain | Employee Builder docs |
| Code evidence | `OPERATIONAL_ELIGIBILITY.md` states Phase 7B removed Department Job Role; schema/UI present |
| Governing decision | Eligibility model is forward; Job Role removal is intent |
| Current vs expected | Doc describes completed removal; code restored |
| Risk | High |
| Recommended action | Annotate doc in Phase 1; finish removal in Phase 2 |
| Dependencies | ARR-008 |
| Proposed phase | 1–2 |
| Verification needed | Employee Builder screens |

### ARR-025 — Operations Engine retirement (positive control)

| Field | Content |
|---|---|
| Affected domain | Legacy Operations Engine |
| Code evidence | LEG-06 cleanup; Constitution notes Operation retired; no competing OperationInstance engine found in current model list |
| Governing decision | RETIRED Sep 25, 2026; LEG-06 |
| Current vs expected | Aligned |
| Risk | Low |
| Recommended action | Preserve as example of successful traced retirement |
| Dependencies | None |
| Proposed phase | — |
| Verification needed | None |

---

## Optional configuration behavior register

| Domain | Not configured behavior (observed/intended) | Exception fabrication risk |
|---|---|---|
| Operating Rhythm | `NOT_CONFIGURED` / no window | Low if meal guess stays gone |
| Shifts | No scheduled presence | Low |
| Assignments | Fallback to signed-in place; must not hide work | Medium while Work still exists |
| Coverage need | No episode | Low |
| Records attachment | No due slots | Medium if flag/engine mismatch |
| Job Flow | Still on with Department; content thins | Medium due to Work dependency |
| PM | No occurrences | Low |
| Menus | No applicable menu | Low |
| Notifications clock | Time-shaped events silent in prod | Expected until ARR-009 |

Distinguish **not configured** from **out of standard** / **overdue** / **uncovered** — only the latter are operational exceptions.

---

## Recommended phase adjustments

1. **Phase 1 must include “restore supersession” documentation** before rewriting contracts as if retirement completed.
2. **Phase 2 is the critical path** and is larger than a cleanup: Work, Location Function/profile/Experience, Job Role, and consumer rewires (Job Flow, partner, staffing).
3. **Phase 3** should harden Operational Time + Scheduled Evaluation contracts without activating production cron by default.
4. **Phase 4–5 blocked** on Phase 2 Job Flow independence from Work.
5. **Phase 6 activation** of clock/push needs explicit host + PO approval (already documented).
6. Safe parallel work after Phase 1: Dashboard composition polish that does not touch Work; Records Catalog content; Plant PM (already separate cron); documentation-only fixes.

### Product-owner decisions required before Phase 1

1. Authorize Phase 1 canonical doc edits (Constitution, Domain Model, Registry, Language Guide, Product registry copy, stale Nov 4 status paragraphs).
2. Confirm restore `e179c0d` is temporary compatibility, not a reversal of Nov 1–2 architecture.
3. Confirm generic Work remains retired (no Task/Activity replacement).
4. Confirm Location Function remains retired (explicit place ids only).
5. Confirm Department Job Role remains retired in favor of operational qualifications + registry roles.
6. Decide whether Phase 1 may change customer-facing capability strings before code removal.
7. Hosting plan for sub-hour Scheduled Evaluation (not required to start Phase 1 docs, required before Phase 6 clock on).

---

## Verification performed / limits

- Migration history and schema model inventory.
- Reference counts for Work / Location Function / Job Role.
- Scheduled Evaluation vs vercel crons.
- Department Builder nav and Job Flow imports.
- Cross-read of binding amendments vs Nov 4 “complete” audits.

Limits: did not execute full test suite; did not query production table row counts; did not exhaust every route file for Work panel mounts.
