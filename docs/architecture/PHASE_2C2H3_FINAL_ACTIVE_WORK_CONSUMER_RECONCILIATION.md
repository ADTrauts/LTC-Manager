# Phase 2C-2H-3 — Final active generic Work consumer reconciliation

**Date:** November 8, 2026  
**Verdict:** **PASS WITH GAPS**  
**Nature:** Reconcile remaining forward consumers of retired plan-derived Work (EVS location sequencing, Harbor WORK_PRESET discovery, partner/Builder/Plant discovery) without removing ONE_OFF, offline sync, or historical persistence. **No deploy. No migrations. No schema drop.**

---

## 1. SHAs

| | |
|---|---|
| Starting HEAD | `345b0338efd0e945adadd65fb713f66f20ad1a1e` (Phase 2C-2H-2 checkpoint) |
| Ending HEAD | Working tree on `345b033` (commit when approved) |

Preflight: 2C-2H-2 verified and committed. `.neon` excluded.

---

## 2. Exact files changed

| Path | Change |
|---|---|
| `src/lib/scheduling/operational-assignments/location-sequencing.ts` | Filter sequencing inputs to `sourceKind === "ONE_OFF"`; update note |
| `src/lib/scheduling/operational-assignments/index.ts` | Export helper |
| `src/lib/harbor-console/console-catalog.ts` | Browse omits WORK_PRESET; `listConsoleWorkPresetCatalogItems` for historical |
| `src/lib/harbor-console/console-catalog-browse.ts` | Remove Work family tab; filter WORK_PRESET from browse |
| `src/components/harbor-console/marketplace-browse.tsx` | Copy without Work presets |
| `src/components/partner/partner-facility-shell.tsx` | `work: false` nav |
| `src/lib/department-administration/overview-guidance.ts` | No configure prompt; historical row only when plans exist |
| `src/lib/department-administration/plant-getting-started.ts` | Drop configure-Work step; historical when plans exist |
| `src/components/plant-operations/plant-starter-panel.tsx` | No new Work install checkboxes |
| Tests (EVS 11C, Harbor, overview, Plant 5A/5B, new 2H-3 suite) | Updated / added |
| This report + ARR-003 | Docs |

---

## 3. Location sequencing

**Finding:** `buildDeterministicLocationSequence` ranked rooms by incomplete `WorkRequirement` without reading `sourceKind`. Production EVS SPACES scope fed unfiltered `flow.work`, so WORK_PLAN still reordered rooms after employee item cutover.

**Implementation:** Sequencer now applies `workRequirementsForLocationSequencing` (`ONE_OFF` only). Empty / plan-only input falls back to Assignment `sortOrder` + label. No Records/WO/Rhythm urgency invented.

**Product decision remaining:** Whether EVS should later sequence from canonical incompletes (Records due, WO, etc.). Not authorized here.

---

## 4. Harbor preset reconciliation

- Marketplace browse no longer loads or shows WORK_PRESET.
- Work family tab removed from `MARKETPLACE_FAMILIES`.
- Legacy `?family=work` normalizes to `all` and still excludes WORK_PRESET.
- `toWorkPresetCatalogItem` / detail route `/console/catalog/work/[presetKey]` retained.
- `listConsoleWorkPresetCatalogItems` available for non-browse historical projection.
- Create actions remain Records-only.
- Plant starter UI cannot select Work presets for install (server already threw 2B).

---

## 5. Partner legacy route decisions

- `/partner/work` remains read-only historical list (2B retired notice).
- Partner shell nav no longer links Work (`work: false`).
- Deep links and route registry preserved.
- Partner actions still return `GENERIC_WORK_AUTHORING_RETIRED`.

---

## 6. Remaining Work dependency classification

| Classification | Examples |
|---|---|
| Retired forward capability | Harbor WORK_PRESET browse; partner Work nav; Builder “Configure work”; Plant “Configure recurring Work”; sequencing WORK_PLAN influence |
| Temporary ONE_OFF compatibility | Supervisor create/complete; employee Job Flow items; offline workContext; sequencing ONE_OFF bump |
| Offline command compatibility | `COMPLETE_OPERATIONAL_TASK`; old bundles with WORK_PLAN; receipts/conflicts |
| Historical/audit reader | `/staffing/work-plans`, `/partner/work`, Harbor work detail URL, overview historical row, Plant getting-started when plans exist |
| Dormant / non-UI | `deriveSpaceWorkSummary` (tests), location-program WORK_PLAN_APPLICABILITY overlays |
| Genuine unresolved active dependency | None for plan-derived **presentation** after 2H-3. Persistence/schema remain |
| Schema retirement | Prisma Work models — deferred |

---

## 7. ONE_OFF preservation

Creation, assignment/reassignment, employee/supervisor visibility, completion, offline commands/receipts — unchanged.

---

## 8. Historical / offline compatibility boundaries

- 2C-2H-2 contracts unchanged (new workContext ONE_OFF-only; old bundles readable; sync ungated by workContext).
- No cache purge; no command format change.
- Historical plan lists retained where useful.

---

## 9. Authorization verification

Nav/catalog hides do not weaken server auth. Partner page still requires setup authority. Harbor detail still requires Harbor staff. Sequencing still limited to assigned locations. No new mutation endpoints.

---

## 10. Progressive configuration

| Config | Behavior |
|---|---|
| No Work Plans | Sequencing = Assignment order; no Builder/Plant Work prompts; Harbor empty of Work |
| Plan-only | Sequencing ignores plans; historical overview/getting-started awareness only |
| ONE_OFF only | Sequencing may prioritize those rooms; employee/offline unchanged |
| No ONE_OFF / no Assignment spaces | Soft empty sequence / null EVS attachment |
| No Records / OR | Unaffected |

---

## 11. Tests and known gaps

**Passed (0 fail):** new 2H-3 suite; EVS 11C sequencing; Harbor catalog/browse/marketplace V1; overview guidance; Plant 5A/5B; 2A/2B fences; 2G-2/2H-1/2H-2 regressions. Harbor DB catalog test expectations updated (skip without disposable DB).

**Gaps:** No browser/device offline certification. No live EVS field walkthrough. Sequencing replacement product decision open. `starters.workPresets` registry flag remains true as legacy metadata.

---

## 12. Remaining release blockers

1. Explicit production deploy approval for 2G-2 → 2H-3 app surface.  
2. Device offline certification.  
3. Optional EVS sequencing product decision.  
4. Schema/table retirement still blocked (LEG / ARR-003 persistence).  
5. Tracked separately: CDA write-manifest gap for `setEmployeeOperationalQualificationsAction`.

---

## 13. Recommended Phase 2C final certification plan

1. Integration certification pass across Job Flow, Dashboard, supervisor, offline hermetics, Harbor browse, partner shell, Plant getting-started.  
2. Manual EVS SPACES Assignment smoke (order follows rooms / ONE_OFF only).  
3. Harbor Marketplace smoke (no Work tab; Records/Departments intact; work detail URL still loads).  
4. Partner smoke (Work absent from nav; `/partner/work` deep link read-only).  
5. Separate deploy approval.  
6. Do **not** begin schema retirement in the same wave.

**Phase 2C readiness for final integration certification:** **Yes, locally** (hermetic). Production release remains blocked on deploy approval + device gaps above.

**STOP** after Phase 2C-2H-3.
