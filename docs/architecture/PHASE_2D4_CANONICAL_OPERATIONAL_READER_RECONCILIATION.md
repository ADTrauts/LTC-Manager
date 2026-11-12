# Phase 2D-4 — Canonical Operational Reader Reconciliation

**Date:** November 9, 2026  
**Nature:** Local implementation + certification. No production/staging deploy. No schema DROP.  
**Certification verdict:** **PASS WITH GAPS**  
**Depends on:** [PHASE_2D3…](./PHASE_2D3_FACILITY_DEPARTMENT_ROOM_FOUNDATION.md), [PHASE_2D2…](./PHASE_2D2_CANONICAL_ROOM_DEPARTMENT_CONFIGURATION_CONTRACT.md)  
**Protects:** Phase 2C production (`7973254` / `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS`)

---

## 1. Starting / ending SHAs

| Item | Value |
|---|---|
| 2D-4 base (2D-3 checkpoint) | `f71f27c14b6b4240b868551d318716b43f1ef397` |
| Starting production protect SHA | `7973254ee87da2d94291f4282337441944d042fa` |
| Ending Git HEAD | `f71f27c14b6b4240b868551d318716b43f1ef397` (2D-4 changes uncommitted on working tree) |
| Checkpoint commit | Local only — **not pushed**; CI verify workflow does not deploy |

Preserved uncommitted (out of 2D-4 commit scope): R4 harness (`scripts/verify/r4-*`, `tests/r4-release-browser/`, R4 gate doc), `.neon`.

---

## 2. Source checkpoint and migration baseline

| Item | Status |
|---|---|
| 2D-3 application + notes migration | Committed as `f71f27c` |
| Disposable verify DB | `ltc_verify_2d3` has notes migration + full history through restore |
| Shared `ltc_manager` / prod / staging | **Not** migrated; **not** targeted |

---

## 3. Exact files changed (2D-4)

| Path | Change |
|---|---|
| `src/lib/canonical-logs/load-run-requirements.ts` | Skip forward `OPERATIONAL_TYPE` expansion (no hub) |
| `src/lib/canonical-logs/load-target-run-logs.ts` | OT overlay loader returns `[]` |
| `src/lib/operational-cycles/load-run-operation-presentation.ts` | `operationalTypeKey: null`; empty `functionSpaces` |
| `src/lib/operational-cycles/load-employee-cycle-context.ts` | `childOperationalTypeKeys: []` |
| `src/lib/operational-cycles/load-supervisor-cycle-overview.ts` | Drop hub; empty child OT keys |
| `src/lib/menu-runtime-db.ts` | `loadOperationalTypeKey` returns null unless explicitly provided |
| `src/lib/offline/build-runtime-bundle.ts` | Cycle resolve without OT hub keys |
| `src/lib/dietary/record-meal-timing.ts` | Participating spaces from Key Time group rooms |
| Hermetic tests (wave-f-i, run-record-LF, OT applicability, OT publication, meal-service) | Updated for 2D-4 contracts |
| This report + ARR-004 | Documentation |

Hub module `load-operational-type-targets.ts` **retained** for Build/Coverage/Teams/Work/historical callers.

---

## 4. Legacy dependency removals by D-OT ID

| ID | Disposition |
|---|---|
| **D-OT-01** (hub as forward SoT for these consumers) | Removed from listed Run/offline/menu paths; module kept for remaining callers |
| **D-OT-02/03/04** Records | Forward OT expansion disabled; explicit SPACE/UNIT/DEPARTMENT/ASSET/FACILITY unchanged |
| **D-OT-08** Offline cycle | No OT child keys in new bundles |
| **D-OT-09/10/11/15** OR presentation / employee / supervisor | No hub; EXPLICIT/ALL continue via existing resolvers |
| **D-OT-12** Menu Runtime | Occurrence no longer loads hub |
| **D-OT-14** Meal timing | Replaced archetype `food_service_area` with Key Time group room membership |
| D-OT-05/06 Coverage | **Deferred 2D-5** (documented below) |
| D-OT-13 Teams | **Deferred 2D-5** (`loadDepartmentOperationalTypeOptions` still used) |
| D-CFG / D-HIST | Build guidance + Audit/Work still may use hub/bindings — not retired |

**Active OT hub/assignment dependencies removed from forward paths this phase:** **8**  
**Remaining active (non-historical) consumers of hub/options:** Work runtime, Builders, Coverage config UI/options, Teams, Dashboard viewer-team-scope, cycle Build options — see §16.

---

## 5. Records applicability before/after

| | Before | After |
|---|---|---|
| Explicit SPACE/UNIT/ASSET/DEPT/FACILITY | Expand normally | Unchanged |
| `OPERATIONAL_TYPE` attachments | Expand via hub → rooms | **Skipped** in forward Run (0 invented requirements) |
| Missing OT bindings | Already 0 spaces | Same fail-soft; no fabricated overdue |

Historical OT rows remain in schema; Review/Audit may still expand.

---

## 6. Facility-type Log default findings and disposition

| Question | Finding |
|---|---|
| Authoring | `addFacilityTypeLogDefaultAction` → `DepartmentFacilityTypeLogDefault` |
| Target determination | Compose in Location Program inspect when room’s `facilityRoomTypeId` matches |
| Future rooms | **Inspect/Build:** auto-overlay. **Run:** does **not** create `LogAttachment` / Run requirements |
| Disposable DB count | `0` rows on `ltc_verify_2d3` |
| Disposition | **Preserve temporarily** (Build composition only). Follow-up: replace UX with deliberate multi-select → committed SPACE attachments; Room Type = selection aid only. Do not silently disable without that UX. |

---

## 7. Operating Rhythm reader changes

- Presentation / employee / supervisor no longer load OT assignments.
- `resolveOperationalCycle` receives empty `childOperationalTypeKeys` / null space OT key.
- EXPLICIT_UNITS and ALL_DEPARTMENT_UNITS continue through existing location modes and `DepartmentOperationalCycleLocation`.
- OPERATIONAL_TYPES / ROOM_TYPE / UNIT_TYPES modes remain in schema/resolvers for compatibility; unbound OPERATIONAL_TYPES fail soft (NOT_APPLICABLE / no invent). Not reinterpreted as ALL_DEPARTMENT_UNITS.

---

## 8. Menu Runtime changes

- Menu location applicability unchanged (explicit unit XOR space).
- Cycle occurrence no longer fetches OT key from hub; optional explicit `operationalTypeKey` input retained for hermetic/compat callers only.
- Canonical EXPLICIT/ALL cycles continue to occur; OT-only occurrence no longer activates from bindings.

---

## 9. Meal-timing explicit targeting

| Contract | Implementation |
|---|---|
| Source | `DepartmentOperationalCycleKeyTimeGroupRoom` for the published KEY_TIME cycle |
| Scope | Spaces under the requested unit (or child units) |
| DEPARTMENT grain | Unchanged (`[null]`) |
| Fail soft | Empty group rooms → `NO_PARTICIPATING_PLACE` (no false missed-meal invent) |
| Rejected | Archetype `food_service_area`; kitchen/servery Room Type inference; cycle location alone |

No new migration — Key Time group rooms already exist.

---

## 10. Offline bundle changes

- Dietary unit cycle resolve uses `childOperationalTypeKeys: []`.
- Explicit cycle locations remain the applicability path for published cycles.
- SPACE responsibility gate unchanged.
- Command/receipt/lease/idempotency contracts untouched.

---

## 11. Historical compatibility status

| Surface | Status |
|---|---|
| Audit OT expand / historical profile select | Preserved |
| Work Plan OT (`load-runtime-work`) | Preserved (ARR-003) |
| OT LogAttachment schema | Preserved; forward Run skips expansion |
| Offline command meaning | Preserved |
| ARR-003 / ARR-008 | Not closed |

---

## 12. Authorization findings

- Changed loaders remain facility-scoped; Records/OR/Menu/meal/offline keep existing Department/session gates.
- Meal timing spaces filtered by facility + unit hierarchy.
- Offline: no expansion of unauthorized Department cycles via shared Space identity (OT removal does not broaden).
- No Dashboard rewrite.
- No verified cross-Department leak introduced in changed paths.

---

## 13. Production compatibility considerations

- Prod already EXPLICIT/ALL cycles, 0 OT attachments/bindings (2D-1) → forward OT skip is low-risk.
- Meal timing: facilities that relied solely on empty archetype bindings already got `NO_PARTICIPATING_PLACE`; they must configure Key Time group rooms for LOCATION grain.
- Do not deploy until notes migration + this code ship together with Key Time group configuration guidance.

---

## 14. New migrations

**None** in 2D-4. Meal timing reuses Key Time group rooms. Notes migration remains 2D-3’s `20261109150000_…` (disposable-only so far).

---

## 15. Test results

| Suite | Result |
|---|---|
| Focused 2D-4 hermetics (Records OT, wave-f-i, OR publication, menu runtime, meal-service, notes hermetic/db, write-manifest) | **64 pass / 0 fail** |
| TypeScript (`tsc --noEmit`) | **2 errors**, both in unrelated uncommitted `scripts/verify/r4-auth-checks.ts` — not 2D-4 |
| Offline tablet/Chromium CI-gate | **Not re-run this phase** (browser matrix not executed; limitation) |
| Full production `next build` | **Not run this phase** (limitation) |

Do not treat R4 harness TS debt as a 2D-4 failure.

---

## 16. Remaining active OT readers / options consumers

| Consumer | Role | Next phase |
|---|---|---|
| `department-work/load-runtime-work.ts` | Work OT applicability | ARR-003 / later |
| `builder-context-summary.ts` | Build guidance | 2D-5 CFG |
| `dashboard/viewer/viewer-team-scope.ts` | Team OT bindings | Dashboard / 2D-5 |
| Coverage `loadDepartmentOperationalTypeOptions` + matcher OT keys | Coverage Build/match | **2D-5** |
| Teams `loadDepartmentOperationalTypeOptions` | Team walk OT keys | **2D-5** |
| Cycle Build / cycle-service options | Build picker | Compat / later |
| Historical Audit | History | Keep |

---

## 17. Phase 2D-5 prerequisites

1. Re-add or confirm Coverage template `spaceId` (see §Coverage finding).  
2. Rehome Coverage matcher + Teams walk-list off OT keys.  
3. Strip remaining Build guidance OT display where forward.  
4. Preserve progressive configuration and auth.  
5. Do not DROP profile tables.

### Coverage schema discrepancy (for 2D-5)

| Claim | Reality |
|---|---|
| 2D-2: spaceId missing | Accurate for **current Prisma model** |
| 2D-3: column exists | **Partially wrong** — migration `20261102170000_coverage_explicit_space` added it; restore `20261106214500` **dropped** `OperationalAssignmentTemplateItem.spaceId` again |
| Disposable DB now | **No** `spaceId` column on template items |
| What `spaceId` means elsewhere | Evaluation **context** / episode / assignment covered spaces — **not** a persisted template-item target today |
| Matcher | OT keys + optional `unitId` only |

2D-5 must treat explicit template Space targeting as a **forward additive** schema+matcher task, not a rename of existing OT keys.

---

## 18. Release blockers and deployment requirements

Before any production deploy of 2D-3+2D-4:

1. Apply `20261109150000_department_space_responsibility_notes` (additive).  
2. Ship 2D-3 notes UI/services with 2D-4 reader changes.  
3. Confirm Key Time group rooms configured for Dietary LOCATION-grain meal timing where needed.  
4. Re-run offline browser CI-gate on disposable DBs.  
5. Clean or exclude R4 harness TS errors from release typecheck if that path is included.  
6. **Do not** DROP LF/OT/profile tables.  
7. Explicit PO approval to deploy.

---

## Success criteria

| Criterion | Status |
|---|---|
| Records forward explicit targets | Met |
| OR without OT bindings for listed loaders | Met |
| Menu without OT hub | Met |
| Meal timing explicit service locations | Met (Key Time groups) |
| Offline without OT hub | Met |
| Room Type no new assumptions | Met |
| Auth preserved | Met |
| Historical compatibility | Met |
| Prod/staging unchanged | Met |
| Gaps | Offline browser + full build not re-run; Facility-type defaults Build composition remains; Coverage/Teams OT remain; Work/Audit still OT-aware |

**PASS WITH GAPS**
