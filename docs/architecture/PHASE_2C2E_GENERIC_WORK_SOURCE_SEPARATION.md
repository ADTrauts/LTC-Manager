# Phase 2C-2E — Generic Work source separation & retirement readiness

**Date:** November 8, 2026  
**Verdict:** **PASS WITH GAPS**  
**Nature:** Explicit plan-derived vs one-off CompatWork discriminator + cutover helper; **no** live removal of plan-derived Work.

---

## 1. SHAs

| | |
|---|---|
| Starting HEAD (2C-2D checkpoint) | `b36de82f6fa01153f221d2de292641ed3a92c452` |
| Ending HEAD | Working tree on top of `b36de82` (commit when approved) |
| Prior | `ebaac8b` (2C-2C), `bf83128` (2C-2B) |

Preflight: 2C-2D verified and committed as `b36de82`. `.neon` excluded.

---

## 2. Exact implementation changes

| Path | Change |
|---|---|
| `src/lib/employee-runtime-flow/job-flow-item.ts` | `compatibilitySource` on `JobFlowItem`; helpers `isPlanDerivedCompatibilityWork` / `isOneOffCompatibilityWork` / `withoutPlanDerivedCompatibilityWork` (**not wired into compose**) |
| `src/lib/employee-runtime-flow/index.ts` | Exports |
| `src/lib/offline/types.ts` | Additive `compatibilitySource` on offline item snapshot |
| `src/lib/employee-runtime-flow/serialize-offline.ts` | Pass through source discriminator |
| `src/lib/employee-runtime-flow/job-flow-item.hermetic.test.ts` | Source separation tests |
| `src/lib/employee-runtime-flow/phase-2c2e-work-source-separation.hermetic.test.ts` | **New** |
| `docs/architecture/PHASE_2C2E_GENERIC_WORK_SOURCE_SEPARATION.md` | This report |
| ARR-003 | Progress note |

**No UI behavior change.** Plan-derived Work still appears in live Job Flow.

---

## 3. Plan-derived versus one-off source contract

Authoritative field: `DepartmentWorkOccurrenceSourceKind` / `WorkRequirement.sourceKind`

| Value | Origin | Typical href |
|---|---|---|
| `WORK_PLAN` | Published plan materialization in `resolveWorkRequirements` | `/staffing/work-plans` |
| `ONE_OFF` | Supervisor one-off loop over existing occurrences | `/staffing/operations?work=…` |

Job Flow mapping (2C-2E):

- `ownerKind` remains `COMPATIBILITY_WORK`
- `compatibilitySource` = `WORK_PLAN` | `ONE_OFF`
- `ownerId` unchanged (`occurrenceId ?? occurrenceKey`)

Do not treat “missing plan id” alone as one-off — resolver sets `sourceKind` explicitly.

---

## 4. Active consumer inventory (source → consumer)

| Consumer | Reads plan-derived | Reads one-off | Notes |
|---|---|---|---|
| `resolveUnitWorkRequirements` / `resolveWorkRequirements` | Yes | Yes | SoT derivation |
| `loadEmployeeRuntimeFlow` → `flow.work` / `flow.items` | Yes | Yes | Via CompatWork adapter |
| `presentEmployeeRuntimeExperience` | Yes | Yes | From items |
| `next-action.ts` | Yes | Yes | Both actionable |
| `WorkCompletionPanel` / `?work=` | Yes | Yes | Occurrence key |
| Offline `workContext` + `COMPLETE_OPERATIONAL_TASK` | Yes | Yes | Commands preserved |
| Offline `jobFlowItemContext` | Yes (+ source) | Yes (+ source) | Display snapshot |
| Dashboard Expected Work | Yes (primarily plans) | Via same resolver | `load-expected-work.ts` |
| Location sequencing (EVS) | Uses work requirements | Same | Soft empty if none |
| Supervisor Work exceptions | Yes | Yes | Separate surface |
| Runtime Location State | **No** generic Work | — | Certified Work-free |
| Canonical Operational Review | **No** generic Work | — | Preserve |

---

## 5. Canonical replacement coverage (examples)

| Plan-shaped activity | Likely canonical owner | Equivalent today? |
|---|---|---|
| Temperature / sanitizer logs | Records | Often yes when Harbor/template attached |
| Meal-ready / service milestones | Operating Rhythm Key Points | Partial — Dietary servery milestones exist; not every Work item |
| Assigned Plant repair | Work Order | Yes for assigned WO path |
| Recurring PM | PM → generated WO | Yes for WO execution owner |
| “Walk the mechanical room / visual check” | Records (preferred) or deferred PO | **Not** auto-mapped; rounds stay product decision |
| Ad-hoc “reorganize storeroom” | One-off (temporary) | Not Records/OR by default |

Coverage is **not** numerical parity with published Work Plan item counts.

---

## 6. Operational impact assessment

Read-only Prisma inspection against the configured `DATABASE_URL` failed:

> `DepartmentWorkPlan` table does not exist in the current database.

**Gap:** This environment cannot certify live published-plan activity counts. Impact if plan-derived Job Flow contribution were removed **without** verification:

- Employees would stop seeing plan-derived CompatWork rows and next-actions from those rows.
- One-off, Records, Key Points, assigned WOs, exceptions would remain.
- Dashboard Expected Work / supervisor Work surfaces would still need their own later cutover.
- Historical occurrences and offline queues would remain in storage.

**Do not conclude zero active Work from empty fixtures.**

---

## 7. Current offline compatibility

- `workContext` still carries all actionable Work requirements (plan + one-off).
- `jobFlowItemContext` now includes `compatibilitySource` (schema still v1 additive field).
- No rejection of queued plan-derived or one-off completions.
- After a future cutover: new bundles may omit plan-derived **items** while `workContext`/commands remain until a separate offline phase; queued commands must still receive receipts.

---

## 8. Proposed cutover sequence (not executed)

1. **Approve** PO decisions (one-off permanence, rounds, EVS, historical UI).  
2. Wire `withoutPlanDerivedCompatibilityWork` (or equivalent filter) into `composeJobFlowItems` / employee present only after impact verified.  
3. Keep one-off CompatWork + completion + offline Work commands.  
4. Update Dashboard `work.expected` admission separately.  
5. Supervisor one-off controls remain; plan-derived supervisor exceptions shrink with Job Flow.  
6. Location sequencing: already soft-empty without Work.  
7. Offline: keep `workContext` until commands no longer need plan rows; never drop queued commands.  
8. Historical presenters / Audit path for Work occurrences.  
9. Remaining readers → later schema retirement (**separate approval**).

Smallest activation: filter in compose after certification — no new capability flag required.

---

## 9. Tests and results

**Pass:**

- `phase-2c2e-work-source-separation.hermetic.test.ts`
- `job-flow-item.hermetic.test.ts` (includes discriminator)
- 2C-2C / 2C-2D / ERF / present / 2A / 2B fences (75 in focused batch)

---

## 10. Remaining risks

- Unverified production/test DB occupancy of published plans.
- Dashboard / supervisor still plan-aware after employee cutover.
- Linked-evidence Work (`LINKED_EVIDENCE`) may look like Records but still Completes via Work.
- Offline dual payload until Work commands retire.

---

## 11. Decisions requiring product-owner approval

1. Permanence of one-off supervisor activities (keep / replace / retire).  
2. Plant visual rounds → Records (not PM) confirmation.  
3. Generator visual check stays out of PM.  
4. EVS cleaning: Records vs execution ownership.  
5. Historical Work Audit presentation after Job Flow drops plan-derived rows.  
6. **Authorization to remove plan-derived contribution from live Job Flow.**

---

## 12. Recommended next implementation phase

**Phase 2C-2F (authorized cutover only):** After PO approval + live impact verification, filter plan-derived CompatWork from employee compose/present; certify one-off + canonical items; leave schema and offline Work commands intact.

**STOP** — do not retire plan-derived Work from runtime or drop schema in this phase.
