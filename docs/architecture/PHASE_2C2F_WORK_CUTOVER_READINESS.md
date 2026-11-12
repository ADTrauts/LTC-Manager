# Phase 2C-2F — Work retirement impact verification & cutover readiness

**Date:** November 8, 2026  
**Verification verdict:** **PASS WITH GAPS**  
**Cutover verdict:** **CONDITIONAL GO**  
**Nature:** Read-only schema/impact verification + hermetic shadow of plan-derived removal. **Cutover not activated.**

---

## 1. SHAs

| | |
|---|---|
| Starting HEAD (2C-2E checkpoint) | `b7ae64bb0488161b196555469e6c3ce8f9506d1b` |
| Ending HEAD | Working tree on top of `b7ae64b` (commit when approved) |
| Prior | `b36de82` (2C-2D) |

Preflight: 2C-2E verified (28 focused hermetics) and committed as `b7ae64b`. `.neon` excluded.

---

## 2. Database environment / schema verification

| Check | Result |
|---|---|
| Configured `DATABASE_URL` host fingerprint | `127.0.0.1:5432` (local Postgres) |
| Production / remote host | **Not inspected** — configured URL is loopback |
| Credentials | Not printed |
| `DepartmentWorkPlan` / `DepartmentWork*` tables | **Absent** (`departmentWorkTables: []`) |
| Nov 3 retire migration `20261103140000_retire_generic_work_and_profiles` | **Applied** (`finished_at` 2026-11-03) |
| Nov 6 restore `20261106214500_restore_schema_after_premature_retirement` | **Not applied** (pending in repo vs this DB) |
| Latest finished migration on this DB | ~2026-11-04 |
| Repo migration dirs vs applied finished | 187 dirs / 179 finished; **8 pending**, including restore |

### Why 2C-2E saw “table does not exist”

The local database applied the **premature retirement** migration that dropped generic Work tables, and never applied the **compatibility restore** that recreates them. Application Prisma schema at HEAD still expects `DepartmentWorkPlan*`.

This is **local/dev schema lag**, not evidence that production Work was successfully retired.

### Integrity finding (elevated)

**Local deployment/schema integrity defect:** a database used with current application code is missing tables required by the Prisma schema (retire applied, restore pending). Treat as a high-priority environment hygiene issue separate from Work cutover authorization.

**Do not** run migrations or resets in this phase. Remediation (when authorized): apply pending migrations including the restore on the intended environment, or point verification at a fully migrated authorized DB.

---

## 3. Relevant migration state (summary)

| Migration | Repo | This local DB |
|---|---|---|
| `20261103140000_retire_generic_work_and_profiles` | Present | Applied (also a rolled-back duplicate row exists historically) |
| `20261106214500_restore_schema_after_premature_retirement` | Present | **Pending** |
| Several Nov 2 notification migrations | Present | Pending (history skew relative to later applied rows) |

---

## 4. Active Work Plan impact counts

| Metric | Status |
|---|---|
| Published / draft / effective plans | **UNVERIFIED** |
| Plan-derived open occurrences | **UNVERIFIED** |
| One-off open occurrences | **UNVERIFIED** |
| Production occupancy | **UNKNOWN** |

Cannot query Work tables on this DB. Must not infer zero production usage from fixtures or from a local DB that never restored the tables.

---

## 5. Canonical replacement coverage

Unchanged from 2C-2E qualitative matrix (no new auto-conversions):

| Class | Examples | Coverage |
|---|---|---|
| Fully representable | Harbor/template logs → Records; assigned Plant repair → WO | When those engines already configured |
| Partial | Meal timing Work → OR Key Points / servery milestones | Overlap incomplete |
| Not represented | Ad-hoc “reorganize storeroom” | One-off temporary |
| Product decision | Plant visual rounds / generator visual check | Prefer Records; not PM by default |
| Product decision | EVS cleaning execution | Evidence ≠ execution ownership |

**Loss-of-functionality if cut over without coverage:** employees lose Job Flow visibility of plan-derived CompatWork that has no Records/OR/WO counterpart. One-off and canonical contributors remain.

---

## 6. Shadow comparison results

Hermetic suite: `phase-2c2f-cutover-shadow.hermetic.test.ts`

| Check | Result |
|---|---|
| Plan-derived items removed by `withoutPlanDerivedCompatibilityWork` | Pass |
| One-off retained | Pass |
| Records / Key Points / WO / exceptions retained | Pass |
| Owner IDs stable for retained rows | Pass |
| Next-action drops plan overdue → one-off due (no invented overdue) | Pass |
| Empty proposed composition → next `none` | Pass |
| Helper **not** wired into compose / load-flow / present | Pass |

Live `composeEmployeeRuntimeFlow` still includes plan-derived CompatWork.

---

## 7. One-off preservation verification

- `compatibilitySource === "ONE_OFF"` survives shadow filter.
- Creation / completion / offline Work commands remain in code paths (unchanged this phase).
- After a future cutover, one-off must continue to flow through CompatWork + `workContext` / `COMPLETE_OPERATIONAL_TASK`.

---

## 8. Online completion & deep-link consequences

| Surface | After future cutover |
|---|---|
| Job Flow list / next | Plan-derived rows hidden |
| `?work=` + `WorkCompletionPanel` | May still open if URL known; occurrence may still exist |
| Queued / in-flight completions | Must still process with receipt — do not silent-drop |
| Reopen / reassign / cancel | Domain APIs unchanged; UI may lose discovery for plan-derived |

Policy recommendation for 2C-2G: filter **presentation contribution** first; keep occurrence completion APIs accepting valid plan-derived occurrence keys until a later reader-retirement phase.

---

## 9. Offline command & historical compatibility

| Concern | Required post-cutover behavior |
|---|---|
| Bundles issued before cutover | Still readable; may list plan-derived items in `jobFlowItemContext` / `workContext` |
| Queued `COMPLETE_OPERATIONAL_TASK` (plan or one-off) | Must sync to receipt / conflict — never silent discard |
| Duplicate delivery | Existing idempotency |
| Refresh after cutover | New bundles omit plan-derived **items**; `workContext` policy TBD until commands no longer need plan rows |
| Historical completions | Preserve occurrence/event rows |

No offline protocol change in 2C-2F.

---

## 10. Dashboard / supervisor dependency inventory

| Consumer | Independent of plan-derived Job Flow filter? | Cutover order |
|---|---|---|
| Employee Job Flow compose/present | Direct — primary cutover target | 1 |
| Employee next-action | Uses items — follows filter | 1 |
| Offline item snapshot | Follows items | 2 (after online) |
| Offline `workContext` / Work commands | Keep until command policy decided | Later |
| Dashboard `work.expected` | Separate admission | 3 |
| Supervisor Work exceptions / one-off UI | Keep one-off; plan exceptions shrink | 4 |
| Location sequencing | Soft-empty without Work | Soft |
| RLS / Operational Review | Already Work-free | Preserve |
| Harbor Work presets | Browse debt | Later |
| Schema drop | Last, separate approval | Final |

---

## 11. Tests and failures

**Pass (49 focused, 0 fail):** 2C-2F shadow (4), 2C-2E source separation, `job-flow-item`, `present`, Phase 2A LF authoring fence, Phase 2B Work authoring fence. Runner: `node --import tsx --test` with hermetic env (`DATABASE_URL` cleared).

Also available (not required for this gate): `phase-2c2d-offline.hermetic.test.ts`, `phase-2c2c-presentation.hermetic.test.ts`.

**Baseline debt (not regressions):** ARR-003/004/005; CDA write-manifest gap (`setEmployeeOperationalQualificationsAction` unclassified); Scheduled Evaluation host inactive; no live tablet/browser certification; **local DB missing restore** (ARR-001 hygiene).

---

## 12. Files changed this phase

| Path | Change |
|---|---|
| `src/lib/employee-runtime-flow/phase-2c2f-cutover-shadow.hermetic.test.ts` | **New** shadow suite |
| `docs/architecture/PHASE_2C2F_WORK_CUTOVER_READINESS.md` | This report |
| `docs/architecture/PHASE_0_ARCHITECTURE_RECONCILIATION_REGISTER_2026-11-08.md` | ARR-003 CONDITIONAL GO progress; ARR-001 local restore-lag integrity note |

---

## 13. Remaining product decisions (required for GO → authorize)

1. Authorize employee Job Flow filter of plan-derived CompatWork.  
2. Confirm one-off permanence / temporary retention.  
3. Confirm Plant rounds / generator visual → Records (not PM).  
4. Confirm EVS evidence vs execution ownership.  
5. Confirm Dashboard Expected Work timing relative to employee cutover.  
6. Confirm offline `workContext` retention window for plan-derived commands.  
7. Authorize inspection of a **fully migrated, intended** environment for occupancy counts before production cutover.

---

## 14. Recommended Phase 2C-2G plan (implementation only after PO authorization)

1. Resolve environment: apply pending migrations (including restore) on the verification DB **or** use an authorized migrated host — then re-run occupancy counts.  
2. If occupancy/coverage acceptable to PO: wire `withoutPlanDerivedCompatibilityWork` into employee compose/present only.  
3. Certify one-off + canonical items + next-action + online completion for remaining keys.  
4. Keep offline Work commands accepting valid plan-derived completions with receipts.  
5. Follow with Dashboard / supervisor consumer phases.  
6. Schema drop remains a later explicit program.

---

## Cutover readiness

### Verification phase: **PASS WITH GAPS**

Gaps: production occupancy **UNVERIFIED**; local DB schema behind restore; no browser/device certification.

### Proposed cutover: **CONDITIONAL GO**

Safe to **consider** product-owner authorization of the employee Job Flow filter **after**:

1. Schema-compatible occupancy verification on the intended environment, and  
2. Explicit PO decisions listed above.

A GO/CONDITIONAL GO here **does not** authorize activation. Do not wire the filter without that authorization.

**STOP** after Phase 2C-2F.
