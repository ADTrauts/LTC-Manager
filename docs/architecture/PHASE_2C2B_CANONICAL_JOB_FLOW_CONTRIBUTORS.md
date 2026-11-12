# Phase 2C-2B — Canonical Job Flow contributor integration

**Date:** November 8, 2026  
**Verdict:** **PASS WITH GAPS**  
**Nature:** Wire real Records / Operating Rhythm / Plant WO / Assignment-exception facts into `flow.items` without removing compatibility Work or changing employee presentation.

---

## 1. SHAs

| | |
|---|---|
| Starting HEAD (2C-2A baseline) | `99a90abe7c26ffd419177325ea7dcea28fd488f0` |
| Ending HEAD | `bf83128` (committed after certification) |
| Prior checkpoints | `78dcd3d` (2C-1), `3de0f41` (2A/2B) |

Preflight: 2C-2A verified (51 hermetics), committed as `99a90ab`. `.neon` excluded.

---

## 2. Exact files changed

| Path | Change |
|---|---|
| `src/lib/employee-runtime-flow/job-flow-item.ts` | Real WO / PM / Assignment-exception adapters; stable Key Point identity; dedupe + PM↔WO suppression; deterministic sort |
| `src/lib/employee-runtime-flow/load-canonical-contributors.ts` | **New** — batch assigned WO loader + own call-off exception loader |
| `src/lib/employee-runtime-flow/load-flow.ts` | Loads Plant assigned WOs + own call-off / assignment-revision exceptions into compose |
| `src/lib/employee-runtime-flow/compose.ts` | Passes contributors; milestone collection carries cycle/timing; space+cycle+kind dedupe |
| `src/lib/employee-runtime-flow/types.ts` | Optional milestone cycle/timing/href fields |
| `src/lib/employee-runtime-flow/index.ts` | Exports |
| `src/lib/employee-runtime-flow/job-flow-item.hermetic.test.ts` | Expanded 2C-2B behavioral coverage |
| `docs/architecture/PHASE_2C2B_CANONICAL_JOB_FLOW_CONTRIBUTORS.md` | This report |
| `docs/architecture/PHASE_0_ARCHITECTURE_RECONCILIATION_REGISTER_2026-11-08.md` | ARR-003 progress note |

---

## 3. Canonical contributors connected

| Contributor | Source | How |
|---|---|---|
| Records (Harbor) | RLS `state.evidence` → `collectHarborEvidence` | Already adapted in 2C-2A; reused. Owner id `attachmentId:requirementKey`. Product state owned upstream. |
| Records (legacy template) | `resolveUnitEvidenceRequirements` when canonical logs off | Already adapted; exclusive `evidenceMode` prevents Harbor+template double load in production compose. |
| Operating Rhythm Key Points | RLS milestones | Enriched with `cycleStableKey` + timing locals; attention mapped from owner `statusKey` (overdue only when domain says so). |
| Plant Work Orders | `Repair` rows | Fail-closed: `assignedEmployeeId` + responsible Department + facility. Open statuses + same-day completions. Href `/repairs/[id]`. |
| Assignment exceptions | Own schedule call-off; Assignment revision flag | Call-off from `ScheduleEntry.calledOffAt` for this employee/department today. Revision when `detectAssignmentRevision` changes. |

---

## 4. Contributors still intentionally empty (gaps)

| Contributor | Reason |
|---|---|
| Standalone **PREVENTIVE_MAINTENANCE** items | Actionable execution is the generated Work Order. Loader always passes `preventiveMaintenance: []`. Adapter still suppresses PM if a WO with matching `pmOccurrenceId` is present. Pre-WO OPEN occurrences are **not** projected to frontline Job Flow (no existing employee-facing PM due surface traced as safe). |
| Facility-wide / location-open Work Orders | Auth ambiguous for “everyone in the location.” Fail closed to **assigned-to-me** only. Policy decision required before broadening. |
| Other employees’ call-offs / uncovered Coverage | Would invent staffing gaps or duplicate Notifications. Not loaded. |
| Asset impact Issues as `items` | Still on parallel `flow.issues` only (unchanged presentation). |
| Offline sync conflicts as Assignment exceptions | Supervisor offline conflict model is unit-scoped and not safely employee-owned here. |

---

## 5. Owner identity and lifecycle mapping

| Owner kind | `ownerId` | Lifecycle / due |
|---|---|---|
| `RECORD_REQUIREMENT` | Harbor: `attachmentId:requirementKey`; template: `requirementKey` | `ownerState` = product/template state; Job Flow does not recompute overdue |
| `OPERATING_RHYTHM_KEY_POINT` | `spaceId:cycleStableKey|legacy:kind` | Stable across status changes; `ownerState` = Key Time statusKey |
| `WORK_ORDER` | Repair id | `ownerState` = status, or `status:pm:{occurrenceId}` when PM-generated |
| `PREVENTIVE_MAINTENANCE` | Occurrence id | Suppressed when WO covers it |
| `ASSIGNMENT_EXCEPTION` | `call-off:{entryId}` or `assignment-revision:{oaId}` | Projection of schedule / revision facts |
| `COMPATIBILITY_WORK` | Occurrence id/key | Unchanged transitional |

No Prisma Job Flow model. No completion APIs on Job Flow.

---

## 6. Records and Key Point integration

- Harbor path uses already-resolved RLS evidence (attachment / requirement / window / productState).
- Template path remains compatibility when `CANONICAL_LOGS_ENABLED` is false; not a second forward engine.
- Waived / NOT_APPLICABLE map to `not_applicable` attention; missing optional attachments never invent due rows (upstream progressive empty).
- Key Points use published Cycle timings from RLS. `NONE` / `OPTIONAL` tracking never become overdue (domain `describeKeyTimeStatus`). No published Cycle → zero milestone items.
- Overnight / adjusted times remain owner locals on the item; no second evaluator.

---

## 7. Work Order and PM duplication handling

1. Loader does not load PM occurrences into Job Flow.
2. PM-generated WOs carry `pmOccurrenceId`; `ownerState` encodes `pm:{id}`.
3. `suppressPmDuplicatesAgainstWorkOrders` drops any PM item whose id matches a WO’s encoded occurrence.
4. `jobFlowItemFromPreventiveMaintenance` returns null when `activeWorkOrderId` is set.
5. One actionable item = the Work Order.

Plant rounds remain out of scope (separate PO decision from 2C-1).

---

## 8. Assignment exception behavior

- **Call-off:** only the viewer’s own called-off shift for the Department today → `ASSIGNMENT_EXCEPTION` / `needs_attention`.
- **Assignment revision:** when the prior revision snapshot differs → informational exception.
- **No Assignment:** existing `no_confirmed_assignment` path; signed-in Work fallback preserved; does not invent coverage gaps.
- Does not create Notification threads.

---

## 9. Authorization and Department scoping

- WO query requires `assignedEmployeeId = employeeId`, `responsibleDepartmentId = departmentId`, `unit.facilityId = facilityId`.
- Non-Plant Departments skip WO load (`[]`).
- Records / milestones still filtered by assigned space refs in compose.
- Item `href` values point at existing authorized routes (`/repairs/[id]`, staffing date, Harbor evidence hrefs). Domain server auth remains authoritative.

---

## 10. Progressive configuration results

| Missing optional source | Result |
|---|---|
| No published OR | Zero Key Point items |
| No required Records | Zero Record items |
| No Assignment | Compat Work + WO/exceptions only as loaded; no fabricated place work |
| No Plant WOs / no PM plans | Zero WO / PM items |
| No call-off / no revision | Zero Assignment exceptions |
| No Coverage need | Unchanged — not invented |

---

## 11. Performance implications

- One batched `repair.findMany` for assigned WOs (Plant only).
- One batched `scheduleEntry.findFirst` for own call-off.
- Records / Key Points reuse facts already loaded via RLS / evidence resolvers — no per-item queries.
- No new plugin framework.

---

## 12. Tests executed and results

**Pass (this phase):**

- `job-flow-item.hermetic.test.ts` (13) — Records, OR, Plant, workforce, platform identity
- `employee-runtime-flow.hermetic.test.ts`
- `present.hermetic.test.ts`
- `phase-2a-location-function-authoring.hermetic.test.ts`
- `phase-2b-generic-work-authoring.hermetic.test.ts`

No newly introduced regressions in this suite.

---

## 13. Existing known failures / debt (baseline, not regressions)

- ARR-003 remains **OPEN** while `COMPATIBILITY_WORK` / `flow.work` remain.
- `setEmployeeOperationalQualificationsAction` write-manifest gap — separate CDA track; not dismissed.
- Facility-composition / phase-6 schema-absence hermetics — known restore debt.
- Production Scheduled Evaluation clock / Web Push remain inactive (out of scope).

---

## 14. Remaining compatibility dependencies

- `flow.work` + CompatWork adapters
- One-off supervisor Work + offline Work commands
- `present.ts` / `next-action.ts` still driven by work/evidence/milestones (not `items`)
- Dashboard Expected Work capability
- Historical Work data / published plan readers

UI was **not** switched to `items`.

---

## 15. Recommended next implementation step

**Phase 2C-2C / presentation dual-read** (needs explicit approval): surface `flow.items` in employee presentation beside existing lists, still without removing CompatWork. Then PO decisions on one-off and Plant rounds before Work reader removal.

**Do not** begin Work removal, offline migration, Role Job Flow authoring, or Unified Timeline without approval.

---

## Success criteria checklist

| Criterion | Result |
|---|---|
| Real canonical source facts | Pass (Harbor, Key Points, assigned WO, own call-off) |
| No duplicate SoT / no Job Flow persistence | Pass |
| Domain lifecycle authoritative | Pass |
| Access not broadened | Pass (fail-closed WO) |
| Optional config stays optional | Pass |
| PM + WO not duplicated | Pass |
| Employee behavior / fences preserved | Pass |
| Gaps explicit | Pass WITH GAPS (standalone PM; location-open WO) |
