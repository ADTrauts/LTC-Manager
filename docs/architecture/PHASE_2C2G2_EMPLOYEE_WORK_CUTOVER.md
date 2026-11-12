# Phase 2C-2G-2 — Employee Job Flow plan-derived Work cutover

**Date:** November 8, 2026  
**Verdict:** **PASS WITH GAPS**  
**Nature:** Application-code cutover of employee Job Flow items / next-action only. **Not deployed. No migrations. One-off preserved. Offline `workContext` retained.**

---

## 1. SHAs

| | |
|---|---|
| Starting HEAD | `2e7595627ffdfd4ef82f6289b4b60a93f588ae41` (Phase 2C-2G-1 checkpoint) |
| Ending HEAD | Working tree on top of `2e75956` (commit when approved) |
| Prior | `21a7061` (2C-2F), `b7ae64b` (2C-2E) |

Preflight: 2C-2G-1 docs verified and committed as `2e75956`. `.neon` excluded.

---

## 2. Exact files changed

| Path | Change |
|---|---|
| `src/lib/employee-runtime-flow/compose.ts` | Wire `withoutPlanDerivedCompatibilityWork` onto `flow.items` (both assignment paths) |
| `src/lib/employee-runtime-flow/job-flow-item.ts` | Document helper as activated for employee items |
| `src/lib/employee-runtime-flow/phase-2c2g2-employee-work-cutover.hermetic.test.ts` | **New** activated cutover suite |
| Prior hermetics (2C-2C–2F, present, job-flow-item) | Expect filtered items; ONE_OFF fixtures where CompatWork must remain visible |
| `docs/architecture/PHASE_2C2G2_EMPLOYEE_WORK_CUTOVER.md` | This report |
| ARR register | ARR-003 progress |

---

## 3. Filter activation location

`composeEmployeeRuntimeFlow` in `compose.ts`:

1. Build `work` via `filterWorkToAssignedSpaces` (**unchanged** — may include `WORK_PLAN`).
2. Build items via `composeJobFlowItems({ compatibilityWork: work, … })`.
3. Apply `withoutPlanDerivedCompatibilityWork(items)` → `flow.items`.
4. `resolveEmployeeNextAction({ items: filteredItems, work, … })` — next uses filtered items.

`load-flow.ts` and `present.ts` do not call the helper; they consume the composed flow.

`resolveUnitWorkRequirements` is **not** modified.

---

## 4. Current versus previous behavior

| Surface | Before | After |
|---|---|---|
| `flow.items` CompatWork | Plan + one-off | **One-off only** |
| Employee presentation / next | Could select plan-derived | Plan-derived skipped |
| `flow.work` | Plan + one-off | **Unchanged** (still both) |
| Offline `jobFlowItemContext` | Mirrored items | Filtered (no plan-derived ads) |
| Offline `workContext` | From `flow.work` | May still list plan-derived keys |
| Completion APIs | Unchanged | Unchanged |
| Dashboard / supervisor readers | Unchanged | Unchanged |

---

## 5. ONE_OFF preservation

- `compatibilitySource === "ONE_OFF"` remains in items, presentation, next-action, and offline item snapshots.
- Authoritative `sourceKind` discriminator unchanged.
- Creation / completion / reassignment / offline command paths not removed.

---

## 6. Canonical contributor preservation

Records, Operating Rhythm Key Points, assigned Work Orders, and Assignment exceptions continue through `composeJobFlowItems` and are not filtered by the cutover helper.

---

## 7. Offline compatibility

| Payload | Behavior |
|---|---|
| `jobFlowItemContext` | Follows filtered `flow.items` — does not advertise new plan-derived responsibilities |
| `workContext` | Still serialized from `flow.work` — **may include plan-derived** for legacy `COMPLETE_OPERATIONAL_TASK` |
| Bundle version / command envelopes | Unchanged |

**Remaining intentional gap:** new canonical item snapshots and legacy execution context can disagree for plan-derived rows until a later offline trim phase. Previously issued bundles / queued completions must still receive receipts or conflicts — not silent drop.

---

## 8. Completion and deep-link behavior

- Occurrence completion APIs unchanged.
- `WorkCompletionPanel` / `?work=` deep links still resolve via existing Work domain paths.
- `presentCompatWorkItem` still enriches from `flow.work` when a one-off (or other retained) item is present.
- Plan-derived rows are absent from employee lists but remain addressable if a valid occurrence key is submitted.

---

## 9. Authorization verification

No new endpoints. No broadened Facility/Department/space/WO visibility. Filter only removes plan-derived presentation contributions; it does not add access to canonical owners.

---

## 10. Tests and results

**84 focused hermetics, 0 fail**, including:

- New `phase-2c2g2-employee-work-cutover.hermetic.test.ts` (published-plan fixtures)
- 2C-2E / 2C-2F / 2C-2D / 2C-2C / job-flow-item / present / employee-runtime-flow
- Phase 2A / 2B authoring fences

Covered: WORK_PLAN excluded from items/UI/next; ONE_OFF retained; WO/exceptions retained; empty plan-only → next `none`; offline items filtered vs workContext retained; compose wired / load+present unwired.

---

## 11. Remaining Work readers (ARR-003 not closed)

- Dashboard `work.expected`
- Supervisor Work exceptions / dietary supervisor paths
- Location sequencing (`flow.work` still passed)
- Harbor Work presets / partner pages
- Historical Work readers / persistence
- Offline `workContext` plan-derived rows

---

## 12. Environment and history risks (unchanged from 2C-2G-1)

- Production Work occupancy was verified empty; this cutover does not fix or cause Nov 6 empty-restore data loss.
- Local/staging migration lag remains a separate hygiene concern.
- No PITR/recovery attempted.

---

## 13. Recommended next phase (2C-2H)

1. Separate PO approval to **deploy** this employee cutover.  
2. Then: Dashboard Expected Work / supervisor plan-exception reader retirement.  
3. Later: offline `workContext` plan-derived trim with explicit command policy.  
4. Schema drop only with separate program approval.

---

## 14. Deployment readiness and rollback

| | |
|---|---|
| Local certification | Ready |
| Production deploy | **Not authorized by this phase** |
| Rollback | Redeploy prior SHA without compose filter (`2e75956` / pre-wire). App-only; no data migration. |
| Schema | No change |

**STOP** — do not deploy, remove further readers, or begin schema retirement without explicit approval.
