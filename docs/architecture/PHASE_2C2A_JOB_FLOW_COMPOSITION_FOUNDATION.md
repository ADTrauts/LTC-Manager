# Phase 2C-2A — Job Flow composition foundation

**Date:** November 8, 2026  
**Verdict:** **PASS**  
**Nature:** Incremental foundation — typed owner-referenced Job Flow items without removing compatibility Work or rewriting presentation.

---

## 1. SHAs

| | |
|---|---|
| Starting HEAD | `78dcd3d` (Phase 2C-1 documentation commit) |
| Ending HEAD | `78dcd3d` (implementation in working tree at report time; commit when approved) |
| Prior authoring checkpoint | `3de0f41` (Phase 2A/2B) |

---

## 2. Canonical item type design

Module: `src/lib/employee-runtime-flow/job-flow-item.ts`

| Field | Role |
|---|---|
| `ownerKind` | `OPERATING_RHYTHM_KEY_POINT` \| `RECORD_REQUIREMENT` \| `WORK_ORDER` \| `PREVENTIVE_MAINTENANCE` \| `ASSIGNMENT_EXCEPTION` \| `COMPATIBILITY_WORK` |
| `ownerId` | Meaningful only within `ownerKind` (occurrence id/key, attachment:requirement, space:kind:status, …) |
| `place` | `unitId` / `spaceId` / `assetId` — never invents place access |
| `time` | Owner-supplied window/due instants + optional local clock hints |
| `ownerState` | Opaque token from the owning domain |
| `attention` | Presentation band mapped **from** owner state (does not invent overdue) |
| `label` / `href` | Presentation; actions remain owner endpoints |
| `compatibility` | `true` **only** for `COMPATIBILITY_WORK` |

No Prisma model. No Task/Activity/Duty store.

---

## 3. Adapters reused or modified

| Adapter | Source | Notes |
|---|---|---|
| `jobFlowItemFromCompatibilityWork` | `WorkRequirement` | Transitional; preserves plan-derived + one-off |
| `jobFlowItemFromHarborEvidence` | Harbor evidence on flow | Records |
| `jobFlowItemFromTemplateEvidence` | Legacy template evidence | Records |
| `jobFlowItemFromMilestone` | RLS milestones on flow | Operating Rhythm Key Point |
| `jobFlowItemsFromWorkOrders` / PM / AssignmentExceptions | Stub → `[]` | Progressive empty until 2C-2B |
| `composeJobFlowItems` | Merges the above | Used by `composeEmployeeRuntimeFlow` |

`compose.ts` still filters and presents `work`, `evidence`, `milestones`, `issues` as before. New field: `flow.items`.

Presentation (`present.ts`), next-action, offline serialize, and Dashboard were **not** rewritten.

---

## 4. Owner identity and state rules

- Lifecycle transitions remain on domain APIs (Work occurrence complete, Records submit, WO close, …).
- Job Flow must not decide overdue independently of `ownerState` / attention mapping from that state.
- Overnight windows: carry owner `windowStartsAt` / `windowEndsAt` (Operational Time already used upstream).
- Timeline / Role Job Flows: contract leaves seams only; not implemented.

---

## 5. Compatibility preserved

- `work: WorkRequirement[]` unchanged and still populated.
- Published Work readers, one-off create, completion/reopen/reassign, offline Work commands: **untouched**.
- Phase 2A/2B authoring fences: **intact** (verified by hermetics).
- No new compatibility writers.

---

## 6. Progressive configuration

| Missing optional source | Behavior |
|---|---|
| No Work Plans / empty work | Zero `COMPATIBILITY_WORK` items |
| No Harbor / template evidence | Zero `RECORD_REQUIREMENT` from those adapters |
| No milestones | Zero Key Point items |
| No WO / PM / assignment-exception loaders | Stub adapters return `[]` |
| No Assignment | Existing `no_confirmed_assignment` path; signed-in unit fallback unchanged; does not broaden space access |
| No Role Job Flow | N/A — not implemented |

Absent optional sources contribute **zero** items, not fabricated overdue.

---

## 7. Authorization

- Items are projected only from facts already scoped by `loadEmployeeRuntimeFlow` / compose assignment space filters.
- `ownerId` is not an arbitrary object accessor.
- Actions continue to use owning-domain endpoints via existing `href` / UI.
- Known write-manifest gap (`setEmployeeOperationalQualificationsAction`) remains **recorded for a separate CDA PR** — not bundled here; not an immediate Work-authoring bypass.

---

## 8. Tests

**Pass:**
- `job-flow-item.hermetic.test.ts` (new)
- `employee-runtime-flow.hermetic.test.ts`
- `present.hermetic.test.ts`
- `phase-2a-location-function-authoring.hermetic.test.ts`
- `phase-2b-generic-work-authoring.hermetic.test.ts`

No new regressions observed in this suite.

---

## 9. Known gaps (later steps)

- WO / PM / Assignment exception loaders not wired into `items` yet (stubs)
- Asset impact `issues` remain on the parallel `issues` array (not mapped into `items`)
- UI still reads `work` / `evidence` / `milestones` — not yet `items`
- ARR-003 remains **open** while `COMPATIBILITY_WORK` is composed
- Offline bundle format unchanged

---

## 10. Files changed

- `src/lib/employee-runtime-flow/job-flow-item.ts` (new)
- `src/lib/employee-runtime-flow/job-flow-item.hermetic.test.ts` (new)
- `src/lib/employee-runtime-flow/types.ts`
- `src/lib/employee-runtime-flow/compose.ts`
- `src/lib/employee-runtime-flow/index.ts`
- `docs/architecture/PHASE_2C2A_JOB_FLOW_COMPOSITION_FOUNDATION.md` (this file)

---

## 11. Recommended next step — Phase 2C-2B

Wire real Records/OR contributors already proven here, then add Plant WO/PM readers into `composeJobFlowItems` without removing CompatWork. Keep presentation dual-read (`work` + `items`) until PO decisions on one-off and Plant rounds from 2C-1.

**Do not** remove Work readers or one-off in 2C-2B without explicit approval.
