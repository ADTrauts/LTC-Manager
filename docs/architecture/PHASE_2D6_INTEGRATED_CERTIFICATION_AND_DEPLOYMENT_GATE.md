# Phase 2D-6 — Integrated Certification & Production Release Readiness

**Date:** November 9, 2026  
**Product:** Vssyl (`ADTrauts/LTC-Manager`)  
**Phase:** Architecture Consolidation — 2D-6 (certification only; no production deploy/migrate)  
**Branch:** `architecture/phase-2d6-release-candidate`

---

## 1. Candidate identity

| Field | Value |
|---|---|
| Base SHA (verified 2D-5 checkpoint) | `fdd3ac7af4aa2c6b0812d10b64a812f5e24eaa42` |
| Intermediate 2D-5 application commit | `484e76aac67e8a5de07c94001a7fd162878c7d04` |
| **Release-candidate SHA** | **`9bc5f8320f8491a0c66dab894391bdf3f199d4cb`** |
| Protected production SHA | `7973254ee87da2d94291f4282337441944d042fa` |
| Production deployment | `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` |
| Production domains | `vssyl.com`, `www.vssyl.com` |
| Production schema baseline | **187** finished migrations (2D notes + Coverage Space **not** applied) |

### Included in candidate

- Phase 2D-3…2D-5 application tree (Facility/Department notes, explicit Records/Rhythm/Menu/meal/offline readers, Coverage `spaceId`, Teams/Dashboard Team-scope, residual Build OT guidance removal)
- Additive migrations:
  - `20261109150000_department_space_responsibility_notes`
  - `20261109180000_coverage_template_item_space`
- Certification hermetic corrections:
  - Records OT match fail-closed + Facility-type Build overlay assertion
  - Team cycle redirect copy
  - RLS evidence OT expansion assertion aligned to fail-closed matching
- Phase reports through 2D-5; this 2D-6 gate report

### Excluded from candidate (remain untracked / outside RC)

| Path | Reason |
|---|---|
| `.neon` | Local Neon metadata / credentials surface |
| `scripts/verify/r4-auth-checks.ts` | Unverified R4 harness (locally repaired for dirty-tree `tsc` only) |
| `scripts/verify/run-r4-release-browser.mjs` | Unverified R4 orchestrator |
| `tests/playwright.r4-release.config.ts` + `tests/r4-release-browser/` | Unverified R4 browser harness |
| `docs/architecture/PHASE_2C_RELEASE_R4_FINAL_DEPLOYMENT_GATE.md` | Existing R4 evidence file present untracked in this worktree; prior Phase 2C production evidence already preserved under committed deployment report |

### Unresolved working-tree differences after candidate SHA

Untracked R4 harness + `.neon` only. Application tree at `9bc5f83` is clean.

**Candidate was not pushed.** No production-linked branch update. No deployment.

---

## 2. Architecture contract verification (integrated)

| Contract | Result |
|---|---|
| One canonical `UnitSpace` + Facility Room Type as physical descriptor only | **PASS** — no Room Type → Run requirement generation |
| `UnitSpaceResponsibility` owns Department×Space membership; notes descriptive only | **PASS** |
| Records / Operating Rhythm / Menus / Workforce / Coverage / Teams / Plant own their facts | **PASS** — no parallel LF/profile/archetype engine introduced |
| RLS + Dashboard compose; no duplicate operational state store | **PASS** |
| OT/LF forward authoring remains closed | **PASS** (writers retired; residual Build overlay / hub classified compatibility) |

---

## 3. Build / typecheck

| Gate | Result | Evidence |
|---|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) | Clean candidate + locally repaired untracked R4 so dirty-tree typecheck does not fail |
| `npm run build` (`verify-build.mjs` / Next 16.3.5 webpack) | **PASS** | `verify-build: PASS` |
| CDA write-manifest enforce | **PASS** | `write-manifest.hermetic.test.ts` — 0 unlisted; enforce mode green (445 writes classified) |

---

## 4. Integrated functional regression ledger

| Domain | Result | Evidence source |
|---|---|---|
| Facility / Department rooms + notes | **Passed** | 2D-3/2D-5 reports + `department-space-notes.hermetic.test.ts` |
| Records explicit applicability | **Passed** | `records-explicit-applicability.hermetic.test.ts` |
| Operating Rhythm / Team cycles | **Passed** | `team-cycles.hermetic.test.ts` + prior 2D-4 OR hermetics |
| Menus / meal timing (Key Time rooms) | **Passed** | `meal-service-locations.hermetic.test.ts`, `meal-timing*.hermetic.test.ts` |
| Coverage Space + Unit expansion | **Passed** | `coverage-explicit-space.hermetic.test.ts` (10/10) |
| Teams explicit membership | **Passed** | 2D-5 + team hermetics; OT expansion retired |
| Dashboard fact scope | **Passed** | `facts.hermetic.test.ts` (scope refuse / team rooms / forged dept) |
| RLS composition / evidence OT | **Passed** | `runtime-location-state.hermetic.test.ts` (19/19 after OT fail-closed assert) |
| Plant / WO / PM | **Not re-run full browser** | Prior 2C/2D hermetic coverage retained; **Not tested** as dedicated 2D-6 plant browser |
| Offline tablet CI-gate | **Passed 18/18** | `/tmp/2d6-offline-tablet.txt` — DB `ltc_verify_2d6_tablet` |
| Offline Chromium CI-gate | **Passed 18/18** | `/tmp/2d6-offline-chromium.txt` — DB `ltc_verify_2d6_chromium` |
| Historical Work / Audit OT | **Compatibility retained** | `loadSpaceOperationalTypeAssignments` still used by Work runtime + builder-context summary |

### Focused hermetic totals (this gate)

| Batch | Pass | Fail | Skip |
|---|---:|---:|---:|
| Core final (Records + RLS + Coverage Space + meal-service + facts + write-manifest) | 48 | 0 | 0 |
| Broad domain batch (pre-RLS-fix) | 130 | 1 (obsolete OT expand assert; **fixed**) | 0 |
| RLS after fix | 19 | 0 | 0 |
| Offline tablet `@ci-gate` | 18 | 0 | 0 |
| Offline chromium `@ci-gate` | 18 | 0 | 0 |

Full-repo hermetic catalog was **not** re-run end-to-end in 2D-6 (bounded integrated matrix used instead).

---

## 5. Offline browser certification

| Project | Disposable DB | Result |
|---|---|---|
| `tablet` | `ltc_verify_2d6_tablet` (isolated; dropped after run) | **18 passed / 0 failed** |
| `chromium` | `ltc_verify_2d6_chromium` (isolated; dropped after run) | **18 passed / 0 failed** |

Notes:

- `OFFLINE_BROWSER_CI_GATE=1`, `OFFLINE_BROWSER_SKIP_BUILD=1` (production build already certified)
- Separate mutable occurrence pools (not one shared DB)
- Simulated tablet viewport ≠ physical-device certification (**ACCEPTED DEBT** / gap)

---

## 6. Dashboard authorization audit (release-critical)

### Scope enforcement (code)

| Mechanism | Behavior |
|---|---|
| `scopeDepartmentIdsFor(viewer)` | Facility → viewer’s permitted department ids; Department/Team → single id if in `scopeDepartmentIds`; else `[]` |
| `createDashboardFactPack` `scoped()` | Rejects fact loads for departments outside scope before loader runs |
| `runtimeLocations` | Filters landing refs by `inScope` + Team room set **before** `loadRuntimeLocationStates` |
| Card adapters (`load.ts`) | Iterate `facts.departmentIds` (already scoped); some presenters additionally filter by active department |

### Load-then-filter findings

| Adapter / path | Query | Auth boundary | Aggregate timing | Disclosure? |
|---|---|---|---|---|
| `runtimeLocations` | `loadLocationsView` then filter refs | Viewer scope + team rooms | After filter | **No confirmed disclosure** — internal overfetch of location composition possible under Facility lens; operational refs filtered before state load |
| Coverage / call-offs / records / maintenance / attention | Per `facts.departmentIds` | Scoped department ids | Within scoped set | **No** cross-unauthorized-department payload path identified |
| `recentActivity` | `departmentIds` pack scope | Scoped | Scoped | **No** |
| Partner session remap | `facilitySession()` role lift for loaders | Departments still limited by `scopeDepartmentIds` / access map | N/A | **No confirmed leak**; partner boundaries rely on existing access resolution |

### Hermetic evidence

- Forged department outside scope refused
- Team scope retains only team rooms
- Eligibility / capabilities hide cards without inventing cross-dept facts

### Live 8-persona matrix

| Persona | Executed in 2D-6? |
|---|---|
| Dietary-only / EVS-only / multi-dept / facility-wide / read-only / limited assignment / unauthorized cross-dept / cross-facility | **Not fully re-executed** as live browser/API matrix |

**Disposition:** No **confirmed** cross-Department information disclosure found in adapter audit. Live multi-role Dashboard isolation remains a **verification gap** (not a confirmed defect). Prior Phase 2C R4 auth HTTP probes remain historical evidence only.

---

## 7. Migration readiness

### Disposable expand-then-deploy rehearsal (`ltc_verify_2d6_expand`)

| Step | Finished migrations | `notes` column | Coverage `spaceId` |
|---|---:|---|---|
| Phase 2C baseline (parked 2D migrations) | 187 | absent | absent |
| Apply `20261109150000_…_notes` | 188 | present (nullable TEXT) | absent |
| Apply `20261109180000_…_space` | 189 | present | present (nullable FK → `UnitSpace`, ON DELETE SET NULL) |

Also: fresh `ltc_verify_2d6_migrate` full `migrate deploy` → 189; OT/Work compatibility tables retained where expected; **no destructive SQL** in either additive migration.

### Production (read-only)

| Probe | Result |
|---|---|
| Finished migrations | **187** |
| Notes migration applied | **No** |
| Coverage Space migration applied | **No** |
| Restore migration present | **Yes** |

### Ordering / rollback compatibility

1. Apply notes → verify → apply Coverage Space → verify (PO authorization required; **not executed** here).
2. After both additive migrations, **Phase 2C application remains schema-compatible** (nullable columns unused by old code).
3. Phase 2D application **requires** both columns before promote (Prisma Client expects them).
4. App rollback target after expand: current production deployment `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` / SHA `7973254…` remains viable **application** rollback; **migrations are not reversed**.
5. Do not use destructive down migrations.

---

## 8. Key Time group-room production readiness

Read-only Neon production probe (Terrace View Dietary published KEY_TIME rows):

| Metric | Value |
|---|---|
| Published Dietary KEY_TIME (latest per stableKey) | 3 |
| LOCATION grain | **3** |
| DEPARTMENT grain | 0 |
| LOCATION with zero group rooms | **0** |
| Example | `lunch_due` / `dinner_due` / cycle key — each **1 group / 9 rooms** → risk **OK** |

**Result:** LOCATION-grain meal timing **is in use** and **explicit group rooms exist**. Missing configuration would yield `NO_PARTICIPATING_PLACE` (fail-closed). **No production configuration blocker** observed for the inspected published set.

Do not invent Room Type / archetype fallbacks.

---

## 9. Remaining legacy consumer inventory (post 2D-5/2D-6)

| Symbol / path | Classification |
|---|---|
| `loadSpaceOperationalTypeAssignments` + Work `load-runtime-work.ts` | **Compatibility / ARR-003** active Work runtime |
| `builder-context-summary.ts` OT load | **Build compatibility** inspection |
| Coverage OT-only historical match | **Historical / compatibility** |
| Records OT `matchLogAttachmentToLocation` OPERATIONAL_TYPE → `null` | **Retired forward matcher** (fail closed) |
| Facility-type log defaults in `composeLocationProgram` | **Build overlay only** — not Run `LogAttachment` |
| Team OT keys in DB | **Ignored** for footprint (explicit rooms) |
| Cycle service / hub modules retaining OT types | **Schema / compatibility** |
| Audit/Review historical OT reconstruction | **Historical** |
| RLS sidecars mentioning OT labels | **Compatibility / presentation** |
| LF authoring APIs | **Retired writer/stub** (closed 2A) |

**ARR-004 remains open.** ARR-003 and ARR-008 stay separate. No unexamined forward reader found that **creates new Run requirements** from Room Type / OT alone after 2D-4…2D-5.

---

## 10. Facility-type Log defaults / bulk apply

- New Facility-type default **authoring retired** (2D-5).
- Existing defaults may still appear in Department Builder location program as **TYPE_DEFAULT** Build overlay (`attachmentId: null`).
- **Do not generate** canonical Run attachments from defaults.
- **Bulk apply not implemented** in 2D-6 — recorded as future product work.

---

## 11. Risk register

| # | Risk | Class |
|---|---|---|
| 1 | Cross-Department Dashboard disclosure | **RESOLVED** for confirmed defects; live 8-persona matrix incomplete → residual verification gap |
| 2 | Dashboard load-then-filter overfetch | **ACCEPTED DEBT** (internal composition overfetch under Facility lens; refs filtered before operational state) |
| 3 | Stale hermetics | **RESOLVED** (OT/Records/Team/RLS assertions updated; not weakened for greenwash) |
| 4 | Meal timing missing Key Time rooms | **RESOLVED** for inspected production published LOCATION grains |
| 5 | Coverage Unit expansion duplicates | **RESOLVED** in hermetics (episode-grain semantics covered) |
| 6 | Unit/Space matching | **RESOLVED** (explicit Space; Unit-wide expands; invalid pairs fail safe) |
| 7 | Migration order | **RESOLVED** (rehearsed notes → space) |
| 8 | Old app after additive migrate | **RESOLVED** (nullable additive; 2C app compatible) |
| 9 | Offline auth/sync | **RESOLVED** (tablet+chromium 18/18) |
| 10 | Historical OT config loss | **ACCEPTED DEBT** (forward fail-closed; historical adapters retained; no DROP) |
| 11 | Uncommitted / excluded R4 harness | **ACCEPTED DEBT** (kept outside RC; prior 2C deploy evidence preserved) |
| 12 | Auto-deploy via push | **RESOLVED** (no push; STOP) |

No BLOCKER confirmed for authorization leakage, offline CI-gate failure, incompatible schema plan, or disappearing meal-timing configuration on inspected production cycles.

---

## 12. ARR-004 disposition

**Status: OPEN**

Cleared through 2D-6 for integrated certification of forward explicit targeting + offline/build gates. Still open:

- LF/OT/profile schema retention
- Work runtime OT loader (ARR-003 boundary)
- Historical Audit/Review
- Build overlay Facility-type defaults
- DROP of legacy tables (**not authorized**)

Do **not** close ARR-004. Do **not** close ARR-003 or ARR-008 here.

---

## 13. Proposed production deployment sequence (NOT AUTHORIZED)

### Pre-deployment

1. Clean tree at candidate `9bc5f83` (exclude R4/`.neon`)
2. Retain this report + prior 2C production deployment report
3. Reconfirm production schema still 187; Key Time rooms still present
4. Confirm rollback deployment `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` still READY
5. Vercel project `ltc-manager` / production env verification
6. Database backup / Neon branch snapshot precaution

### Controlled schema expansion (PO authorization required)

1. Apply `20261109150000_department_space_responsibility_notes`
2. Verify column + app health on Phase 2C build
3. Apply `20261109180000_coverage_template_item_space`
4. Verify FK/index + app health on Phase 2C build
5. Confirm old application still serves `vssyl.com`

### Application release (after expand verified)

1. Stage production-configured deploy of `9bc5f83` **without** reassigning public aliases
2. Smoke staged app
3. Promote to `vssyl.com` / `www.vssyl.com`
4. Authorized smoke: login, Department Builder notes, Coverage Space targeting, Records/Job Flow, meal timing, offline prepare
5. Watch runtime errors

### Rollback

- Re-promote `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` (SHA `7973254…`)
- Leave additive columns in place
- Do not delete operational data

**Successful 2D-6 certification does not authorize production deployment.**

---

## 14. Final verdicts

### A. Certification verdict

**PASS WITH GAPS**

Required integrated build, migration rehearsal, offline tablet/chromium, domain hermetics, Key Time production readiness, and static Dashboard authorization audit passed. Bounded gaps remain: live 8-persona Dashboard isolation matrix not re-executed; physical tablet not certified; Facility-type Build overlay + ARR-004 compatibility retained; full-repo hermetic catalog not fully replayed.

### B. Deployment recommendation

**CONDITIONAL — PRODUCT-OWNER APPROVAL REQUIRED**

Ready for **deployment approval discussion** after:

1. Explicit PO approval of additive migrations + application promote
2. PO acceptance of the Dashboard live multi-role verification gap (or a bounded pre-promote auth probe)
3. Confirmation of rollback deployment still READY at promote time

**Do not deploy, migrate production/staging, push production-linked branches, or DROP legacy schema without separate authorization.**

---

## 15. STOP

Phase 2D-6 complete for certification documentation. No production deployment, migration, schema deletion, or additional implementation authorized by this report.
