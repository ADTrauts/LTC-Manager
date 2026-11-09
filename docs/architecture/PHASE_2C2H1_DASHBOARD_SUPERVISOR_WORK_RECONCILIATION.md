# Phase 2C-2H-1 — Dashboard & supervisor generic Work reconciliation

**Date:** November 8, 2026  
**Verdict:** **PASS WITH GAPS**  
**Nature:** Retire plan-derived Expected Work from Dashboard admission/presentation and plan-derived supervisor Work exceptions. Preserve one-off. **No deploy. No migrations. No offline protocol change.**

---

## 1. SHAs

| | |
|---|---|
| Starting HEAD | `32eaba493d9cff946340d33e8608e50774dd376b` (Phase 2C-2G-2 checkpoint) |
| Ending HEAD | Working tree on `32eaba4` (commit when approved) |

Preflight: 2C-2G-2 verified and committed. `.neon` excluded.

---

## 2. Consumer inventory (dependency map)

| Consumer | Classification | 2C-2H-1 action |
|---|---|---|
| Dashboard capability `work.expected` | Plan-derived admission gate | **Never admit**; remove from setup expectations |
| Card `expected_work` | Plan-derived card | Remains registered; ineligible without capability; drill-down → `/staffing/operations` |
| `loadTodaysExpectedWork` / present | Mixed (plans + one-off via resolver) | Presenter **filters WORK_PLAN**; never advertises Work Plan configure |
| `loadSupervisorWorkExceptions` | Mixed | **ONE_OFF only** |
| Dietary supervisor `needsAttention.work` | Via exceptions loader | Follows ONE_OFF filter |
| `/staffing/operations` one-off create/manage | One-off | **Preserved** (actions untouched) |
| Employee Job Flow items | Already cut over (2G-2) | Unchanged |
| Offline `workContext` / `flow.work` | Mixed compatibility | **Preserved** |
| Location sequencing | Accepts WorkRequirement[] (often plan-derived) | **Deferred** — soft-empty without Work; no rewrite |
| Harbor presets / partner pages | Historical / browse | Untouched |
| Historical Work readers | Historical | Untouched |

---

## 3. Exact files changed

| Path | Change |
|---|---|
| `src/lib/dashboard/capabilities.ts` | Stop admitting `work.expected`; drop Work Plan setup steps; stop querying published plans for admission |
| `src/lib/dashboard/cards/registry.ts` | Expected Work drill-down → operations |
| `src/lib/work/expected/present-expected-work.ts` | Filter WORK_PLAN; never configureHref to work-plans |
| `src/lib/department-work/load-runtime-work.ts` | Supervisor exceptions = ONE_OFF only |
| Dashboard / expected-work hermetics | Updated expectations |
| `src/lib/dashboard/phase-2c2h1-work-reconciliation.hermetic.test.ts` | **New** |
| This report + ARR-003 | Docs |

---

## 4. Dashboard capability changes

- `work.expected` remains in `DASHBOARD_CAPABILITIES` for type/layout compatibility.
- `deriveDepartmentDashboardCapabilities` **never** adds it to `has`.
- SETUP_EXPECTATIONS no longer include Work Plan setup for FN / CUSTOM.
- Published Work Plan query removed from capability resolver (no longer needed for admission).
- Default layouts may still list `expected_work`; eligibility drops the card when capability absent (safe degrade).

---

## 5. Supervisor exception changes

`loadSupervisorWorkExceptions` filters `sourceKind === "ONE_OFF"` before state/priority attention filters. Plan-derived overdue/due rows no longer appear as supervisor Work attention.

---

## 6. One-off compatibility preservation

- Create / complete / reassign actions on `/staffing/operations` and work-runtime actions **unchanged**.
- Employee Job Flow still shows ONE_OFF (2G-2).
- Supervisor attention still surfaces ONE_OFF exceptions.
- Offline Work commands / receipts untouched.

---

## 7. Canonical owner integrations preserved

Records, Operating Rhythm, Coverage, Plant WO/PM, Assets/Issues, Notifications — not rewritten. Supervisor board continues to compose those separately from Work exceptions.

---

## 8. Location sequencing findings

`buildDeterministicLocationSequence` still accepts `workRequirements` and is used for EVS Job Flow sequencing. It soft-empties without Work. Filtering plan-derived at that boundary is a **proposed 2C-2H-2 follow-up** — not rewritten here to avoid inventing new ordering rules.

---

## 9. Authorization verification

No new endpoints. Capability retirement only removes a Dashboard card admission path. One-off and completion APIs keep existing `resolveWorkAuthority` checks.

---

## 10. Progressive configuration

| Config | Behavior |
|---|---|
| No Work Plans | No Expected Work card; no Work Plan setup nag |
| Only one-off | Supervisor exceptions / employee items show one-off; Dashboard Expected Work still not admitted |
| No Records / OR / Coverage | Existing canonical notConfigured reasons only |
| Empty optional engines | No fabricated Work Plan configuration failure |

---

## 11. Tests

**78 focused hermetics, 0 fail**, including:

- New 2C-2H-1 suite
- Dashboard capabilities + eligibility
- Expected Work presenter (plan filtered; one-off remapped mechanic tests)
- Supervisor operations hermetics
- Employee 2G-2 cutover + 2A/2B fences

---

## 12. Remaining offline / historical dependencies

- `flow.work` may still include plan-derived for offline `workContext`
- Occurrence completion APIs / historical readers
- Harbor Work presets / partner pages
- Location sequencing WorkRequirement input
- Prisma Work models (no drop)

ARR-003 remains **open**.

---

## 13. Known gaps

- Location sequencing still accepts plan-derived requirements when callers pass them.
- Expected Work loader still resolves full requirements then filters at present — defense in depth; capability never admits the card.
- Saved layouts referencing `expected_work` simply omit the card (by design).
- Production deploy not in scope.

---

## 14. Recommended Phase 2C-2H-2

1. Explicit offline presentation trim for newly issued bundles (plan-derived out of `workContext` advertising) with receipt policy for in-flight commands.  
2. Optional EVS location-sequencing call-site filter (ONE_OFF / non-Work inputs only).  
3. Harbor preset / partner browse cleanup.  
4. Separate deploy approval for 2G-2 + 2H-1 app changes.

---

## 15. Deployment readiness & rollback

| | |
|---|---|
| Local certification | Ready |
| Deploy | **Not authorized** |
| Rollback | Redeploy prior SHA (`32eaba4`); app-only |
| Schema | Unchanged |

**STOP** after Phase 2C-2H-1.
