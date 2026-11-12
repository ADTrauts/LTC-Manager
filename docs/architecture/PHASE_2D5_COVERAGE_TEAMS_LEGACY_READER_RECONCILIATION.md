# Phase 2D-5 — Coverage, Teams & Residual Legacy Reader Reconciliation

**Date:** November 9, 2026  
**Nature:** Local implementation + certification. No production/staging deploy. No schema DROP.  
**Certification verdict:** **PASS WITH GAPS**  
**Depends on:** [PHASE_2D4…](./PHASE_2D4_CANONICAL_OPERATIONAL_READER_RECONCILIATION.md), [PHASE_2D3…](./PHASE_2D3_FACILITY_DEPARTMENT_ROOM_FOUNDATION.md), [PHASE_2D2…](./PHASE_2D2_CANONICAL_ROOM_DEPARTMENT_CONFIGURATION_CONTRACT.md)  
**Protects:** Phase 2C production (`7973254` / `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS`)

---

## 1. Starting / ending SHAs

| Item | Value |
|---|---|
| 2D-5 base (verified 2D-4 checkpoint) | `fdd3ac7af4aa2c6b0812d10b64a812f5e24eaa42` |
| Prior 2D-3 checkpoint | `f71f27c14b6b4240b868551d318716b43f1ef397` |
| Starting production protect SHA | `7973254ee87da2d94291f4282337441944d042fa` |
| Ending Git HEAD | `fdd3ac7af4aa2c6b0812d10b64a812f5e24eaa42` |
| Ending application state | **Uncommitted** 2D-5 working tree on top of `fdd3ac7` (not pushed; no deploy) |

Preserved out of scope (uncommitted, not certified as app): R4 harness (`scripts/verify/r4-*`, `tests/r4-release-browser/`, R4 gate doc), `.neon`.

---

## 2. Verified implementation checkpoint

| Item | Status |
|---|---|
| 2D-3 notes migration `20261109150000_…` | Present; applied only on disposable `ltc_verify_2d3` |
| 2D-4 OT reader removals | Intact on base `fdd3ac7` |
| 2D-5 Coverage `spaceId` migration `20261109180000_…` | Authored; applied **only** on disposable `ltc_verify_2d3` |
| Shared `ltc_manager` / prod / staging | **Not** migrated; **not** targeted |

---

## 3. Exact files changed (2D-5)

| Path | Change |
|---|---|
| `prisma/schema.prisma` | `OperationalAssignmentTemplateItem.spaceId` + `UnitSpace` / item relations |
| `prisma/migrations/20261109180000_coverage_template_item_space/` | Forward-only additive FK |
| `src/lib/scheduling/coverage-expectations/{types,match-expectation,load-coverage,views,service,index}.ts` | Explicit Space/Unit targeting; reject forward OT authoring |
| `src/lib/scheduling/coverage-episodes/observe.ts` | Pass `spaceId` into flattened items |
| `src/app/.../coverage-{actions,workspace}.tsx` | Unit vs Space picker; no OT checkboxes |
| `src/lib/department-teams/team-operational-type-applicability.ts` | Explicit membership only |
| `src/lib/department-teams/service.ts` | No forward OT writes; safer `spaceIds` |
| `src/app/.../team-actions.ts`, `teams-workspace.tsx` | Drop OT form fields; keep room picker |
| `src/lib/dashboard/viewer/viewer-team-scope.ts` | No OT/archetype expansion |
| `src/app/.../cycles-builder-controls.tsx` | Remove Location Function authoring radio |
| `src/app/.../locations-programming-client.tsx` | Retire Facility-type log-default **authoring** |
| Hermetics (coverage explicit-space, teams OT, phase-g, cycles UX, team-organization) | Updated |
| This report + ARR-004 | Documentation |

---

## 4. Coverage template schema before / after

| | Before (post-restore) | After 2D-5 |
|---|---|---|
| `roleKey` / `roleLabel` / `requiredCount` | Present | Unchanged |
| `unitId` | Optional | Optional; forward Unit-wide when set **and** OT keys empty |
| `spaceId` | **Absent** (dropped by `20261106214500` restore) | **Nullable** FK → `UnitSpace` |
| `applicableOperationalTypeKeys` | Forward + historical | **Historical compatibility only** |
| `applicableOperationalCycleStableKeys` | Present | Unchanged |

Forward authoring XOR: exactly one of `spaceId` **or** `unitId`. Both together rejected. OT keys on write rejected.

---

## 5. Coverage matching semantics

Order in `matchCoverageItemToLocation`:

1. **`spaceId` set** → match that Space only (`EXPLICIT_LOCATION`).
2. **`unitId` set, OT keys empty** → match any context Space whose `unitId` equals the item (Unit-wide expansion for the space-grained episode system).
3. **`unitId` set with OT keys** → **no match** (unsupported combination; constrained, not precedence).
4. **No place, OT keys present** → historical `OPERATIONAL_TYPE_DEFAULT` when context OT key matches.
5. Else → no match (progressive: empty config invents nothing).

Dedup key includes `spaceId` and `unitId`.

**Not inferred from:** Room Type, Department responsibility, notes, or Assignment presence.

---

## 6. Unit versus Space behavior

| Target | Room contexts | Notes |
|---|---|---|
| Space | Only that `UnitSpace.id` | Precise |
| Unit-wide (no OT) | Every Department Space in that Unit | Intentional expansion for episode grain |
| Unit + OT keys | None | Invalid combo |
| OT-only (legacy) | Rooms whose runtime OT key matches | Compat only; not forward-authored |

Separate template items combine by resolution + dedupe; they do not silently override each other. Actual staffing still matches via `assignmentCoversLocation` (space locations, else unit).

---

## 7. Team membership behavior

| Before | After |
|---|---|
| Explicit rooms ∪ OT-key expansion via archetype bindings | **Explicit `DepartmentTeamRoomMembership` only** |
| Create/update could write `applicableOperationalTypeKeys` | Forward writes reject non-empty OT keys; create stores `[]`; update leaves historical keys unless clearing |
| Room Type filter in UI | Filter only — membership remains selected rooms |

Shared physical rooms do not cross Department Team data. Team config does not invent Coverage.

---

## 8. Dashboard viewer-team-scope

`resolveViewerTeamScopes` no longer loads `departmentOperationalProfile` / archetype bindings. Room IDs = explicit Team room memberships only.

`operational-placement.ts` remains the **assignment-based** placement path (separate from Team membership scope). Unchanged this phase.

---

## 9. Authorization findings

| Finding | Severity | Notes |
|---|---|---|
| Team walk-list OT expansion removed | Mitigated | Was the 2D-1 D-OT Team/Dashboard risk |
| Facility / Department filters on membership query | Preserved | `facilityId` + `departmentId` on Team |
| Shared Space ≠ cross-Department Team disclosure | Preserved | Membership is Department-scoped |
| Other Dashboard adapters may still load-then-filter | **Open for 2D-6** | Not rebuilt; card registry paths need release-gate audit |
| Cross-Department private ops disclosure | No new defect found in modified Team-scope path | Full Dashboard RLS rebuild out of scope |

---

## 10. Department Builder guidance changes

| Surface | Change |
|---|---|
| Cycle builder | Location Function / OT radio removed; default to specific rooms; legacy notice if old OT keys present |
| Teams UI | Explicit rooms only; Room Type is filter copy |
| Locations inspector | Facility-type “add log to all type rooms” authoring retired; message points to explicit SPACE attach |
| Suppress / restore / remove existing type defaults | **Retained** for compatibility |

No new Operational Profile / archetype authoring.

---

## 11. Facility-type Log default disposition

| Question | Answer |
|---|---|
| Forward authoring available? | **No** (UI retired this phase) |
| Affects Run LogAttachments? | **No** (Build overlay / inspection only; 2D-4 established) |
| Expectation / reporting pipeline? | Build presentation only |
| Existing records | **Preserved**; suppress/restore/remove remain |
| Bulk-apply UX | **Not** built; bounded follow-up if customer needs type-wide attach |

---

## 12. Remaining OT consumers (classified)

| Class | Examples |
|---|---|
| Forward runtime (compat / residual) | Historical Coverage OT match; Work plan runtime (`department-work`); some runtime-location-state sidecars |
| Forward configuration | Cycle service still *can* persist `OPERATIONAL_TYPES` mode from API; UI no longer offers it; Team catalog may still list OT options for display |
| Compatibility | `loadSpaceOperationalTypeAssignments` hub retained; Team `applicableOperationalTypeKeys` column |
| Historical | Audit / operational-review historical OT; attachment OT rows |
| Retired authoring stub | Location Function actions; Facility-type default add UI |
| Test fixture | Many hermetics still name OT keys |
| Documentation / schema-only | Profile/archetype tables; ARR-004 |

**Do not delete the OT hub** (ARR-004).

---

## 13. Historical compatibility preserved

- OT key arrays on Coverage items and Teams remain in schema.
- Published OT-only Coverage still matches at evaluation via path (4).
- Team historical OT keys not wiped on ordinary Team save.
- Facility-type defaults not deleted.
- 2D-3 notes + 2D-4 Records/OR/Menu/meal/offline behavior unchanged by this phase.

---

## 14. Migration details

| Migration | Role |
|---|---|
| `20261109150000_department_space_responsibility_notes` | 2D-3; required before/with release of notes UI |
| `20261109180000_coverage_template_item_space` | 2D-5; additive `spaceId` after restore |

Ordering: restore → notes → coverage space. App code after 2D-5 expects `spaceId` column when writing Space targets. Unit-only and legacy OT rows need no data conversion.

**Applied to:** disposable `ltc_verify_2d3` only.  
**Not applied to:** production, staging, shared local app DB.

---

## 15. Test results

| Suite | Result |
|---|---|
| Core 2D-5 hermetics (coverage explicit-space + expectations, teams OT/org, viewer-team-scope, phase-g, cycles UX) | **77 pass / 0 fail** |
| Cross-phase (meal-timing, menu-runtime, write-manifest, 2A LF authoring, space-notes, locations-programming) | **34 pass / 0 fail** |
| DB on `ltc_verify_2d3` (coverage-episode, operational-placement, teams) | **4 pass / 0 fail** (after `spaceIds` null-safe fix; prior pollution flake cleared) |
| Pre-existing stale hermetics (e.g. `records-explicit-applicability` OT targets; `team-cycles` redirect string) | Still red on `fdd3ac7` baseline — **not introduced by 2D-5**; tracked as cert gaps |
| Typecheck | App clean; **2 errors** only in uncommitted `scripts/verify/r4-auth-checks.ts` (same 2D-4 R4 harness gap) |
| Production `next build` | **Not re-run** this phase (gap → 2D-6) |
| Offline browser CI projects | **Not re-run** this phase (gap → 2D-6) |

---

## 16. Production compatibility risks

| Risk | Mitigation |
|---|---|
| Deploy app without `20261109180000` | Prisma client expects `spaceId` — migrate disposable/prod in order before enabling Space authoring writes |
| Existing OT-only Coverage in non-empty environments | Continues to match historically until managers republish with Space/Unit |
| Team OT keys in DB | Ignored for footprint; rooms must be explicit |
| Meal timing Key Time rooms | Still must be verified before any production rollout (2D-4 carry-forward) |

---

## 17. Remaining ARR-004 obligations

ARR-004 stays **open**. Cleared in 2D-5 for Coverage forward authoring, Teams expansion, Dashboard Team-scope expansion, Cycle LF UI, Facility-type default authoring. Still open: hub/schema retention, Work runtime, historical Audit/Review, runtime-location-state sidecars, full Dashboard authorization release gate, offline browser + production build certification, DROP of LF/OT tables (**not authorized**).

ARR-003 (Work Job Flow) and ARR-008 (workforce roles) remain separate.

---

## 18. Exact Phase 2D-6 certification requirements

1. Commit/checkpoint 2D-3 + 2D-4 + 2D-5 application tree without R4 harness pollution (or fix R4 `tsc` separately).  
2. Re-run offline browser CI-gate on **separate disposable DBs**.  
3. Production build + typecheck on clean candidate.  
4. Layered authorization isolation tests (Department-only, multi-Department, shared Space, cross-facility) across Dashboard cards; document any remaining load-then-filter paths.  
5. Migration plan for prod/staging: `20261109150000` then `20261109180000` with rollback/readiness notes.  
6. Confirm Key Time group-room configuration before meal-timing production reliance.  
7. PO decision on Facility-type default residual / bulk attach UX.  
8. **Do not DROP** OT/profile/archetype tables without separate authorization.  
9. **Do not deploy** without explicit product-owner authorization.

---

**STOP.** Phase 2D-5 complete for local certification. No deploy, no legacy schema deletion, no Phase 2D-6 start without PO authorization.
