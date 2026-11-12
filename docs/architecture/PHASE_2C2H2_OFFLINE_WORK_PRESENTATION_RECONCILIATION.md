# Phase 2C-2H-2 — Offline generic Work presentation retirement

**Date:** November 8, 2026  
**Verdict:** **PASS WITH GAPS**  
**Nature:** Newly issued offline bundles must not advertise plan-derived (`WORK_PLAN`) Work as active employee obligations. Preserve ONE_OFF presentation, `COMPLETE_OPERATIONAL_TASK` for legacy queued plan completions, unfiltered `flow.work`, and additive `jobFlowItemContext`. **No deploy. No migrations. No protocol rewrite.**

---

## 1. SHAs

| | |
|---|---|
| Starting HEAD | `b4b3dbb057de8368ccaf1ca27760d62e86348f1d` (Phase 2C-2H-1 checkpoint) |
| Ending HEAD | Working tree on `b4b3dbb` (commit when approved) |

Preflight: 2C-2H-1 verified and committed. `.neon` excluded.

---

## 2. Exact files changed

| Path | Change |
|---|---|
| `src/lib/employee-runtime-flow/serialize-offline.ts` | `filterWorkRequirementsForOfflinePresentation` (ONE_OFF + presentation states); shared `serializeOfflineWorkContextRequirements`; `serializeEmployeeRuntimeWorkContext` uses filter |
| `src/lib/employee-runtime-flow/index.ts` | Export filter helpers |
| `src/lib/offline/build-runtime-bundle.ts` | Leftover Job-Flow-off Work path uses the same filter |
| `src/lib/offline/types.ts` | Document ONE_OFF-only advertising for new bundles; old caches may still list plans |
| `src/lib/employee-runtime-flow/compose.ts` | Comment accuracy only (`flow.work` vs advertising) |
| `src/lib/employee-runtime-flow/phase-2c2d-offline.hermetic.test.ts` | Expect ONE_OFF-only `workContext` |
| `src/lib/employee-runtime-flow/phase-2c2g2-employee-work-cutover.hermetic.test.ts` | Align offline advertising expectations |
| `src/lib/employee-runtime-flow/phase-2c2h2-offline-work-presentation.hermetic.test.ts` | **New** focused suite |
| This report + ARR-003 | Docs |

---

## 3. New offline presentation contract

| Slice | New-bundle behavior |
|---|---|
| `jobFlowItemContext` | Unchanged from 2C-2D/2G-2: filtered `flow.items` (canonical + ONE_OFF; no WORK_PLAN) |
| `workContext` | **Advertise ONE_OFF only** via authoritative `sourceKind === "ONE_OFF"` |
| `flow.work` (composer) | **Unfiltered** — still may include WORK_PLAN for enrichment / historical keys |
| Records / evidence / milestones | Unaffected |
| Plant WO context | Read-only; no completion |
| Assignment exceptions | Informational |

Display vs execution (unchanged ownership):

| Owner | Offline display | Offline execution |
|---|---|---|
| Records | Supported | Existing evidence command |
| Operating Rhythm | Supported | Existing milestone commands |
| Assigned Plant WOs | Read-only | Not supported |
| Assignment exceptions | Informational | Not supported |
| ONE_OFF Work | Supported | `COMPLETE_OPERATIONAL_TASK` |
| WORK_PLAN Work | **Not in new presentation** | Old queued commands accepted or explicitly rejected by existing sync rules |

No bundle schema version bump. `OFFLINE_JOB_FLOW_ITEM_SCHEMA_VERSION` remains `1`.

---

## 4. WORK_PLAN filtering location

Single source of truth: `filterWorkRequirementsForOfflinePresentation` in `serialize-offline.ts`.

Call sites:

1. `serializeEmployeeRuntimeWorkContext` (Job Flow-on bundle path).
2. Leftover Job-Flow-off Work assembler in `build-runtime-bundle.ts` (space-scope then same filter).

Does **not** filter `resolveUnitWorkRequirements`, Dashboard, supervisor exceptions, or `flow.work`.

Does **not** infer ONE_OFF from missing plan ids — only `sourceKind === "ONE_OFF"`.

---

## 5. ONE_OFF preservation

- ONE_OFF stays in `flow.items` and new `workContext`.
- Offline UI can still raise `COMPLETE_OPERATIONAL_TASK` from ONE_OFF rows.
- Supervisor create/reassign ONE_OFF and online Job Flow ONE_OFF cutover (2G-2) unchanged.

---

## 6. Old bundle compatibility

- Cached bundles that already list WORK_PLAN in `workContext` remain readable under existing lease/version rules.
- No forced cache purge.
- Unsupported `jobFlowItemContext.schemaVersion` still yields empty items (2C-2D behavior).
- Stale-lease rejection unchanged.

---

## 7. Command and receipt integrity

- `processWorkCompletionCommand` does **not** consult `workContext` membership.
- Valid legacy WORK_PLAN completion payloads remain processable; missing/invalid occurrences use established reject/conflict paths (`CONFLICT_REVIEW_REQUIRED`, `ALREADY_ACCEPTED`, etc.).
- Command envelopes, idempotency, receipts, retries unchanged.
- No alternate `completeJobFlowItem` endpoint.
- No silent drop of queued commands.

---

## 8. Authorization verification

Unchanged: facility/department scoping, employee auth, assigned location restrictions, offline session/lease, revocation, command-level auth, WO assigned-to-me read-only. Filter only reduces advertised Work rows; it does not broaden owners or IDs.

---

## 9. Progressive configuration

| Configuration | New advertising |
|---|---|
| No Work Plans / no ONE_OFF | Empty `workContext.requirements` |
| Plan-only | Empty advertising; no invented overdue items |
| ONE_OFF present | ONE_OFF retained |
| No Assignment | Composer may keep Work rows; advertising still ONE_OFF-only |
| No OR / Records | Unaffected; empty optional engines invent nothing |

---

## 10. Tests and results

**Hermetics passed (0 fail)** including:

- New `phase-2c2h2-offline-work-presentation.hermetic.test.ts`
- Phase 2C-2D offline suite (updated)
- Phase 2C-2G-2 employee cutover
- Phase 2C-2H-1 Dashboard/supervisor
- Offline bundle/sign-out/space body hermetics
- Phase 2C-2C / 2C-2E / JobFlowItem / EmployeeRuntimeFlow
- Expected Work presenter
- Phase 2A / 2B authoring fences

Fixtures include real `WORK_PLAN` and `ONE_OFF` `sourceKind` rows.

---

## 11. Browser / device verification status

**Not certified.** No live tablet disconnect/reconnect run in this phase. Hermetic coverage only. Record as intentional gap.

---

## 12. Remaining legacy Work dependencies (ARR-003 open)

- `flow.work` still loads plan-derived rows (compatibility / enrichment)
- Occurrence completion APIs and historical readers
- Location sequencing callers that pass plan-derived `WorkRequirement[]`
- Harbor Work preset browse / partner compatibility pages
- Prisma Work models (no drop)
- Production deploy of 2G-2 → 2H-2 app changes

---

## 13. Recommended next phase

1. Location-sequencing call-site filter (ONE_OFF / non-Work inputs only) — separate authorization.  
2. Harbor preset / partner browse cleanup.  
3. Separate deploy approval for 2G-2 + 2H-1 + 2H-2.  
4. Do **not** drop Work schema or remove `COMPLETE_OPERATIONAL_TASK` yet.

---

## 14. Release and rollback

| | |
|---|---|
| Local certification | Ready (hermetic) |
| Deploy | **Not authorized** |
| Rollback | Redeploy prior SHA (`b4b3dbb`); app-only |
| Schema / migrations | Unchanged |
| Forced offline purge | Not used |

**Online/offline parity:** Newly issued bundles match online Job Flow advertising (canonical + ONE_OFF; no plan-derived Work). Cached pre-2H-2 bundles may still show plan-derived Work until refresh — documented exception.

**STOP** after Phase 2C-2H-2.
