# Phase 2C-2C — Unified employee Job Flow presentation

**Date:** November 8, 2026  
**Verdict:** **PASS WITH GAPS**  
**Nature:** Employee-facing presentation consumes canonical `flow.items` without duplicate parallel rendering; compatibility Work and offline Work protocol preserved.

---

## 1. SHAs

| | |
|---|---|
| Starting HEAD (2C-2B checkpoint) | `bf83128ca4cbb5597194fbfa299fe8e49c7392c5` |
| Ending HEAD | `ebaac8b` (committed after certification) |
| Prior | `99a90ab` (2C-2A), `78dcd3d` (2C-1), `3de0f41` (2A/2B) |

Preflight: 2C-2B verified (59 hermetics), committed as `bf83128`. `.neon` excluded.

---

## 2. Exact files changed

| Path | Change |
|---|---|
| `src/lib/employee-runtime-flow/present.ts` | Present from `flow.items`; enrich href/actions from parallel collections; add `workOrders` + `exceptions` |
| `src/lib/employee-runtime-flow/next-action.ts` | Items-first next-action; skip exceptions / completed / N/A; WO next kinds |
| `src/lib/employee-runtime-flow/compose.ts` | Compose `items` before next; pass `items` into resolver |
| `src/lib/employee-runtime-flow/types.ts` | `due_work_order` / `upcoming_work_order` next kinds |
| `src/lib/employee-runtime-flow/index.ts` | Exports |
| `src/components/unit-workspace/employee-runtime-experience.tsx` | Render WO + exceptions; avoid duplicate keys; customer copy tweak |
| `src/lib/employee-runtime-flow/phase-2c2c-presentation.hermetic.test.ts` | **New** focused 2C-2C tests |
| `docs/architecture/PHASE_2C2C_UNIFIED_EMPLOYEE_JOB_FLOW_PRESENTATION.md` | This report |
| `docs/architecture/PHASE_0_ARCHITECTURE_RECONCILIATION_REGISTER_2026-11-08.md` | ARR-003 progress |
| `docs/architecture/PHASE_2C2B_CANONICAL_JOB_FLOW_CONTRIBUTORS.md` | Ending SHA note |

---

## 3. Existing presentation behavior audited

| Surface | Prior behavior |
|---|---|
| Loader | `loadEmployeeRuntimeFlow` → compose → `presentEmployeeRuntimeExperience` |
| UI | `EmployeeRuntimeExperience` on Neighborhood / SPACE via `tryRenderEmployeeRuntimeExperience` |
| Discovery | Parallel `work`, evidence groups, milestones, issues, plantMessages |
| Completion | Query `?work=` → `WorkCompletionPanel` on `flow.work`; evidence via Harbor/template forms; servery chrome from milestones |
| Next | `resolveEmployeeNextAction` from work/evidence/milestones |
| Offline | `serialize-offline.ts` reads `flow.work` / evidence / milestones — **not** `items` |

Inventory distinction:

| Kind | Role |
|---|---|
| COMPATIBILITY_WORK | Actionable (complete / linked Record) |
| RECORD_REQUIREMENT | Actionable via Records engine |
| OPERATING_RHYTHM_KEY_POINT | Milestone / recordable when owner status says so |
| WORK_ORDER | Actionable navigation to `/repairs/[id]` (assigned-to-me) |
| ASSIGNMENT_EXCEPTION | Informational only |
| Asset `issues` | Compatibility path (not yet JobFlowItem) |

---

## 4. Canonical item presentation implemented

`presentEmployeeRuntimeExperience` partitions `flow.items` (space-filtered) into:

- `work` ← COMPATIBILITY_WORK (href enriched from `flow.work` for unit `?work=` completion)
- `workOrders` ← WORK_ORDER
- `evidenceGroups` ← RECORD_REQUIREMENT (Harbor/template enrichment)
- `milestones` ← OPERATING_RHYTHM_KEY_POINT (owner status filter)
- `exceptions` ← ASSIGNMENT_EXCEPTION

Parallel collections are **not** independently listed when the same fact is already an item. Asset `issues` remain the documented compatibility path (still not in `items`).

UI sections: “What needs you” (tasks / work orders / Records), “Key points”, “Operational notices” (exceptions + asset issues + plant messages).

---

## 5. Compatibility paths preserved

- Published-plan Work occurrences and one-off Work via CompatWork items + `WorkCompletionPanel`
- Offline serialize / command protocol unchanged (still `flow.work`)
- Phase 2A / 2B authoring fences intact
- Supervisor / Dashboard / Expected Work untouched
- `plantMessages` attention counts retained

---

## 6. Next-action and state handling

- Compose builds `items` first, then `resolveEmployeeNextAction({ items, … })`
- Attention bands from owners only (`needs_attention` → `due_now` → upcoming → location next)
- ASSIGNMENT_EXCEPTION never selected as next required task
- Completed / not_applicable / informational skipped
- KEY_POINT NONE/OPTIONAL never invent overdue (owner attention only)
- New kinds: `due_work_order`, `upcoming_work_order`
- Legacy resolver retained when `items` omitted (direct unit tests)

Presentation state labels map `attention` (+ OVERDUE / PAST_DUE tokens) — no independent overdue calculator.

---

## 7. Duplicate-prevention rules

- Composition already dedupes by `ownerKind:ownerId` and suppresses PM when WO encodes `pm:{occurrenceId}`
- Presentation keys: `work:`, `wo:`, `evidence:` prefixes
- Records vs CompatWork remain distinct owners (linked evidence href on Work does not clone the Record row)

---

## 8. Authorization verification

- No new cross-engine action endpoint
- WO visibility remains fail-closed assigned-to-me from 2C-2B
- Completion still domain panels / routes with server auth
- Missing Assignment does not broaden space execution (`showExecution` false)

---

## 9. Offline compatibility (gap)

Offline bundle **does not** include canonical `items`. Online presentation uses `items`; offline continues prior Work/evidence serialization.

**Required for Phase 2C-2D:** offline adapter to project items (or equivalent) without changing command protocol until designed.

---

## 10. Progressive configuration

Verified empty / partial: no Assignment, no Cycle milestones, no Records, no WO, no CompatWork → empty lists / neutral next — not operational failure.

---

## 11. Desktop / tablet verification

Hermetic presentation + component contract checks only. No live browser visual certification this phase.

---

## 12. Tests and known failures

**Pass (64):**

- `phase-2c2c-presentation.hermetic.test.ts` (5)
- `job-flow-item.hermetic.test.ts`
- `employee-runtime-flow.hermetic.test.ts`
- `present.hermetic.test.ts`
- Phase 2A / 2B authoring fences

**Baseline debt (not regressions):** ARR-003 CompatWork/offline; CDA write-manifest gap; facility-composition / phase-6 schema-absence; Scheduled Evaluation / Web Push inactive.

---

## 13. Remaining Work-dependent UI consumers

- Offline serialize + completion queue (`flow.work`)
- `WorkCompletionPanel` / `?work=` on employee page
- Dashboard `work.expected` / supervisor Work exceptions
- Dietary Job Flow adapters that still project Work
- CompatWork contribution inside `flow.items`

ARR-003 remains **OPEN**.

---

## 14. Recommended Phase 2C-2D scope

1. Offline bundle projection for canonical items **without** breaking Work command protocol  
2. Optionally dual-write offline context from items while keeping Work completions  
3. Document supervisor / Dashboard follow-ons  
4. Do **not** remove Work readers or drop schema without PO approval  

**STOP** — no offline protocol migration, Work reader removal, or schema retirement in this phase.
