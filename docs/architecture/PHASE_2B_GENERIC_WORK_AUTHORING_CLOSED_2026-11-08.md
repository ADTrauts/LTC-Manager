# Phase 2B — Generic Work Plan authoring closed

**Date:** November 8, 2026  
**Verdict:** **PASS WITH GAPS**  
**Scope:** Close obsolete generic Department Work Plan authoring/publishing without deleting persistence or breaking Job Flow readers.  
**Out of scope:** Job Flow rewrite (2C), schema drops, occurrence completion removal, Plant Work Orders / PM, Records, Operating Rhythm, timeline, cron.

---

## Certification summary

| Item | Result |
|---|---|
| Starting HEAD | `a881e89` (Phase 0/1 docs commit) |
| Ending HEAD | `3de0f41` (Phase 2A/2B checkpoint commit) |
| ARR-002 | **Closed** for nav/authoring |
| ARR-015 | **Closed** for plan writers (routes retained read-only) |
| ARR-003 | **Open** — Job Flow still reads Work Plans |
| Schema / Prisma models | **Preserved** |

---

## 1. Writer inventory

| Path | Classification | Phase 2B action |
|---|---|---|
| `createDraft` / `updateDraft` / `duplicateWorkPlan` / `publishWorkPlan` / `retireWorkPlan` / `createSuccessorDraft` / `createDraftFromPreset` (`work-plan-service.ts`) | Active authoring / publication | **Closed** — throw `GENERIC_WORK_AUTHORING_RETIRED` |
| `createWorkPlan*Action` (`staffing/work-plans/actions.ts`) | Active authoring / publication | **Closed** |
| `addPartnerWorkPlanAction` / `publishPartnerWorkPlanAction` | Active authoring / publication | **Closed** |
| Plant starter `kind === "work"` install | Bootstrap / starter writer | **Closed** — throws retired |
| Harbor `WORK_PRESET` catalog | Read / marketplace browse | **Retained** (no create writer) |
| `createOneOff` / `completeExplicit` / mark-not-required / cancel / reopen / reassign | Runtime occurrence writers | **Retained** — Job Flow / supervisor ops |
| Offline `processWorkCompletionCommand` | Runtime completion sync | **Retained** |
| `loadPublishedWorkPlansForDate` / `resolveUnitWorkRequirements` / Expected Work loaders | Runtime / historical readers | **Retained** |
| DB tests calling `publishWorkPlan` | Test/fixture writers | Will fail until updated or deleted in later cleanup |
| Plant Work Order / PM create | Legitimate Plant domain | **Untouched** |

---

## 2. Closed UI surfaces

- Department Builder: `work` removed from primary tabs; `?tab=work` → Overview
- `/staffing/work-plans` and `[workPlanId]`: retired notice + read-only existing plans
- `/partner/work`: retired notice + read-only list; forms unmounted
- Build Home / BUILD nav: Work card and Work nav label removed
- Registry customer copy: removed “Work” / “Location Functions” / “Recurring facility rounds” selling language; `starters.workPresets` kept as compatibility flag (documented)

---

## 3. Intentionally retained

### Runtime readers (ARR-003)
- Employee Runtime Flow / Job Flow Work requirement resolution
- Runtime Location State Work summaries
- Expected Work projections
- Historical review consumers of Work Plans

### Runtime writers (not plan authoring)
- Occurrence complete / not-required / reopen / reassign / one-off create
- Offline work completion sync

### Persistence
- All `DepartmentWorkPlan*` / occurrence models and data

### Re-homing needs (product-owner; not implemented)
| Former Work behavior | Candidate owner | Status |
|---|---|---|
| Plant mechanical / building rounds (Work presets) | Records and/or PM — not decided | **Blocker for deleting presets**; starter install refused |
| Dietary/EVS recurring “plans” | Records / Operating Rhythm / Coverage by intent | No silent discard; authors closed |
| One-off supervisor Work | No approved replacement engine | **Retained** until 2C decides |

---

## 4. Existing Phase 2A / unrelated test debt (classified)

| Failure | Classification | Owner / next phase |
|---|---|---|
| `facility-composition.hermetic.test.ts` (coverage/menus undefined; OT loader assertions) | Outdated expectations + incomplete LF reader reconciliation (ARR-004) | Phase 2 reader cleanup — not a Work authoring defect |
| `write-manifest.hermetic.test.ts` unlisted `setEmployeeOperationalQualificationsAction` | Incomplete CDA classification (ARR-021-adjacent) | CDA program — does not block Work retirement |
| `phase6-generic-work-retired.hermetic.test.ts` “tables gone” / modules deleted | Known restore conflict (ARR-005); first test (no Work tab) now passes | Do not “fix” by dropping schema in 2B |

No authorization defect blocked Work authoring retirement.

---

## 5. Tests performed

**Pass (focused):**
- `phase-2b-generic-work-authoring.hermetic.test.ts`
- `phase-2a-location-function-authoring.hermetic.test.ts` (preserved)
- `admin-nav.test.ts`, `phase-g-terminology.hermetic.test.ts`
- `phase-5a` / `phase-5b` / `final-release-gate` / `healthcare-food-nutrition-identity` (updated expectations)
- `shell-ux-refinement.test.ts`
- `employee-runtime-flow.hermetic.test.ts`

**Known fail (not regressions of 2B authoring):**
- `phase6-generic-work-retired` schema/module absence tests
- facility-composition reader tests; write-manifest qualification listing

---

## 6. Authorization / write-manifest

Plan authoring actions reclassified `LEGACY` / `workPlan`.  
Occurrence runtime actions remain `DEPARTMENT`.  
Retired actions throw or return `{ ok: false }` — not silent success.

---

## 7. Phase 2C prerequisites

1. Inventory every Job Flow / RLS / Expected Work reader of Work Plans  
2. Re-home or drop each composed slice without inventing a Task engine  
3. Decide product fate of one-off Work and Plant round presets  
4. Only then remove occurrence writers, readers, then schema (forward migration + drop approval)

**Stop.** Do not start 2C without explicit authorization.
