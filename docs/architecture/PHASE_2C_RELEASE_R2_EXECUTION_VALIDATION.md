# Phase 2C Release R2 — Execution validation

**Date:** November 8, 2026  
**Release verdict:** **CONDITIONAL**  
**Phase 2C implementation status:** Remains certified (PASS WITH GAPS from final integration cert; R1 CDA gap closed)

---

## 1. Exact candidate SHA

| Item | SHA |
|---|---|
| **Release candidate** | `43e370b54e8bb8b2f826edf384dc8b2421b35ab5` |
| Phase 2C implementation (2H-3) | `0d706e6` |
| Final integration cert docs | `b77042a` |
| CDA R1 manifest correction | `43e370b` (HEAD; includes R1 + docs) |

**Preflight resolution:** Repository HEAD is `43e370b`. R1 is **committed** (`setEmployeeOperationalQualificationsAction` → `DEPARTMENT` / `workforceRecord`). Working tree clean except excluded `.neon`. The R1 report’s “working tree on b77042a” wording was pre-commit; the committed tip is `43e370b`.

---

## 2. Environments actually used

| Environment | Use | Outcome |
|---|---|---|
| Local hermetic (`node --import tsx --test`) | Unique Phase 2C matrix | Executed |
| Disposable Postgres `ltc_verify_phase2c_r2` (created, migrated, **dropped**) | Harbor `.db.test` + EVS Phase 11C SQL | Executed |
| Local `ltc_manager` | Read-only probe only (still behind restore) | Not used for writes |
| Offline browser orchestrator (`npm run test:offline-browser`, CI-gate) | Attempted on disposable DB | **Blocked** — fixture prep fails (see §8) |
| Interactive browser / tablet MCP | No authenticated session | **Not run** |
| Production / staging Neon | Read-only deployment metadata via Vercel | Inspected; **not migrated** |
| Physical tablet | — | **Not run** |

Disposable DB isolation: name prefix `ltc_verify_*`, refused `ltc_manager`, admin create/drop via local `postgres` database. Schema after migrate: **187** finished migrations including `20261106214500_restore_schema_after_premature_retirement`; Work compatibility tables present (`DepartmentWorkPlan`, Occurrence, Item, Events, Applicability).

---

## 3. Unique test pass / fail / skip

### Phase 2C hermetic matrix (unique file list, one run)

**247 tests · 241 pass · 0 fail · 6 skip**

Covers: JobFlowItem, EmployeeRuntimeFlow, present, 2C-2C→2H-2, Dashboard 2H-1 + capabilities/eligibility, Expected Work, supervisor-operations, offline hermetics, 2H-3, 2A/2B fences, Harbor hermetics/browse/marketplace, overview, Plant 5A/5B/gate, vendor-heads, write-manifest (incl. R1), EVS 11C (SQL portions skipped without DB).

### SQL integration (disposable DB)

**11 tests · 11 pass · 0 fail · 0 skip**

- `console-catalog.db.test.ts` (2) — Marketplace omits WORK_PRESET discovery; Records/Department sources intact  
- `phase-11c-assignment-zones.test.ts` (9) — sequencing + EVS SQL assignment/zone/coverage isolation  

### Eligibility suite (ARR-008)

**13 tests · 10 pass · 3 fail · 0 skip** — see §4  

### Offline browser CI-gate

**0 executed** — fixture preparation failed before Playwright (see §8).

**No double-counting of overlapping hermetic batches.** Skips are not passes.

---

## 4. Three eligibility failure classifications

File: `src/lib/employee-operational-qualifications/eligibility.hermetic.test.ts`

| Test | What it asserts | Classification | Operational impact |
|---|---|---|---|
| `template suggestions skip an employee who is not eligible for the role` | `suggestEmployeeForPosition(..., eligibleEmployeeIds: empty)` → `null` | **Outdated expectation** — helper no longer accepts/filters `eligibleEmployeeIds` (signature omits it; comment: role matching not applied) | Assignment **suggestion** UX may propose without qualification filter; **not** a failure of Employee Builder qualification writes |
| `retail functions are registry roles and lead server is not` | `getRoleDefinition("CASHIER")?.departmentKeys[0] === "DIETARY"` | **Outdated expectation** — `CASHIER` absent from current operational role registry | Registry rename/retirement drift; LEAD_SERVER still undefined as expected |
| `new assignments snapshot the registry label and do not derive a job role` | Source must use `const roleLabel = roleDef.label` and must not use Job Role derivation helpers | **Unresolved architectural dependency (ARR-008)** — `assignments/actions.ts` still uses `deriveRoleLabelSnapshot` / `deriveDefaultRoleKeyForDepartmentJobRole` | Dual Job Role / qualification model debt; **outside Phase 2C Work cutover** |

**Employee Builder qualification behavior:** Runtime gates on `setEmployeeOperationalQualificationsAction` remain Manager + password + `assertCanChangeDepartmentPeople`; R1 manifest classified. Hermetic evidence does **not** show unsafe qualification mutation. Failures do **not** BLOCK Phase 2C Work Plan presentation retirement.

**Resolution path:** Separate ARR-008 / Phase 2E role consolidation + test refresh — not authorized in R2.

---

## 5. SQL integration results

PASS on disposable `ltc_verify_phase2c_r2` after `prisma migrate deploy` (includes restore). Harbor Marketplace filtering confirms no WORK_PRESET in browse projection. EVS sequencing SQL confirms Assignment isolation and that WORK_PLAN no longer drives order in hermetic sequencing cases (ONE_OFF / Assignment order per 2H-3). Database dropped after use.

---

## 6. Live browser results

**Not completed.** No interactive authenticated browser session. Offline-browser fixture pipeline failed before UI launch (LF + Work Plan authoring still invoked by `canonical-offline-fixtures.mjs`).

---

## 7. Tablet viewport / device results

| Mode | Status |
|---|---|
| Playwright tablet project (iPad landscape) | Not reached (fixtures failed) |
| Manual tablet viewport simulation | Not run |
| Physical device | Not run |

---

## 8. Offline lifecycle results

**Attempted** `npm run test:offline-browser` with `OFFLINE_BROWSER_CI_GATE=1` against disposable DB.

**Blocker (reproducible):**

```
offline-browser-fixtures → prepareCanonicalOfflineFixture
→ bindLocationFunction / publishLocationFunctionDraft
→ throws: "Location Function authoring is retired..."
```

Also still calls `work.createDraft` / `publishWorkPlan` (Phase 2B retired writers) after LF.

**Impact:** Documented offline browser certification tooling is **stale relative to Phase 2A/2B**. This is a **verification tooling gap**, not evidence that production offline runtime code for ONE_OFF/receipts is broken. Hermetic offline presentation/sync contracts (2C-2D/2H-2) remain green.

**Required follow-up (separate authorization):** Rewrite `scripts/verify/canonical-offline-fixtures.mjs` to use Facility Builder responsibility + Operating Rhythm / Records without LF bind or Work Plan publish; then re-run offline CI-gate.

---

## 9. Authorization HTTP results

| Check | Evidence |
|---|---|
| CDA write-manifest enforce | PASS (R1) |
| Qualification runtime gates in source | Hermetic R1 assertions |
| 2A/2B authoring fences | Hermetic PASS |
| Live HTTP authorized/unauthorized sessions | **Not run** (no fixture login) |

Manifest is not treated as a substitute for runtime authorization.

---

## 10. Database compatibility findings

| Target | Finding |
|---|---|
| Disposable verify DB | Schema-compatible with HEAD after migrate (187 migrations; Work tables restored) |
| Local `ltc_manager` | Still behind (Work tables absent) — hygiene separate |
| Production deploy (Vercel `ltc-manager`) | Current READY production SHA `56de312…` — **behind** candidate `43e370b`; prior 2C-2G-1 said production schema was current with restore — **not re-probed with SQL this phase** |
| Staging | Not migrated; previously lagging — keep separate from app release |

---

## 11. Confirmed functional defects

| Defect | Severity | Release impact |
|---|---|---|
| Offline/canonical fixture pipeline still uses retired LF (and Work Plan) writers | High for **cert tooling** | Blocks live offline/browser E2E until fixtures rewritten |
| Three eligibility hermetics outdated vs ARR-008 reality | Medium test debt | Does not block Phase 2C Work retirement |

No new Phase 2C Job Flow / Dashboard / Harbor presentation regressions found in hermetic or disposable SQL suites.

---

## 12. Remaining accepted legacy dependencies

- Temporary ONE_OFF  
- Offline `COMPLETE_OPERATIONAL_TASK` + old bundle compatibility  
- Historical `/staffing/work-plans`, `/partner/work`, Harbor work detail URLs  
- Prisma Work schema persistence (ARR-003)  
- ARR-008 Job Role dual model  
- Stale offline fixture authors (must be fixed before claiming offline E2E)

---

## 13. Release risk assessment

| Risk | Level | Notes |
|---|---|---|
| Forward WORK_PLAN presentation reappearing | Low | Hermetic + SQL Marketplace/sequencing evidence |
| CDA unlisted write | Closed | R1 |
| Offline E2E unverified on this candidate | Medium | Tooling blocker, not proven product defect |
| Production SHA lag / unapproved deploy | Process | Requires explicit approval |
| ARR-008 suggestion/eligibility drift | Medium product debt | Separate program |

---

## 14. Deployment and rollback plan (not executed)

| Item | Detail |
|---|---|
| Certified candidate | `43e370b` |
| Previous production | `56de3123ae6e5aa99a2979d8a6200469389c3cdb` (Vercel READY) |
| Procedure | Application-only promote of candidate after approval; **do not** couple local/staging migrate hygiene |
| Pre-smoke | Hermetic matrix; confirm target has restore Work tables; CDA enforce green |
| Smoke order | Employee Job Flow → Supervisor ONE_OFF → Dashboard → Harbor Marketplace → Partner nav → Offline (once fixtures fixed) |
| Rollback | Redeploy previous production deployment (`dpl_LJx7vYpGThGJtMK3hoG3hjHRfhbC` / SHA `56de312`) |
| Offline on rollback | App rollback only; does not restore historical Work rows lost in prior destructive migration |
| Conditions to rollback | WORK_PLAN reappears in employee presentation; ONE_OFF broken; auth widening; offline sync silent drops |

---

## 15. Recommendation for Phase 2D planning

Phase 2D (Location Function **reader** retirement) may be **planned** independently. Do **not** implement until authorized.

**Also authorize separately:** offline/canonical fixture rewrite so Phase 2C release can graduate from CONDITIONAL after live offline CI-gate.

---

## Verdicts

### READY FOR DEPLOYMENT APPROVAL? **No — CONDITIONAL**

Hermetic + disposable SQL evidence supports Phase 2C Work retirement integrity. Live browser/offline lifecycle and HTTP auth probes remain incomplete due to retired-authoring fixture coupling. ARR-008 eligibility failures are justified legacy debt and do **not** by themselves BLOCK this release, but offline E2E must be treated as an accepted residual risk or completed after fixture repair.

### Phase 2C implementation

Still **complete / certified** at the implementation layer (`0d706e6` + R1 `43e370b`).

### ARR-008 eligibility failures vs current operations

Affect **assignment suggestion / role-registry / Job Role derivation tests**, not the Phase 2C Work Plan presentation cutover or the classified qualification write. Safe to track separately; do not use them alone to block 2C deploy if product accepts the residual risk and fixture gap.

**STOP.** No deploy. No production data change. No Phase 2D implementation.
