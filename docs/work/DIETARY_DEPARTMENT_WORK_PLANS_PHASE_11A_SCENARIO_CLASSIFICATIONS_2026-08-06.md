# Phase 11A — 77 Scenario Classifications

Honest labels for Dietary Department Work Plans certification scenarios.

| Label | Meaning |
|-------|---------|
| **BROWSER** | Exercised in `test:work-plans-browser` and/or strengthened asset / prior gates |
| **BROWSER SELECTOR SCOPE** | UI selector scoped correctly; foreign-ID reject may still be SERVICE/SQL |
| **SQL** | Covered by `phase-11a-department-work.test.ts` (verify:db) and/or Phase 10A SQL |
| **HERMETIC** | Covered by hermetic unit tests (authority, resolve-requirements, flags, workspace) |
| **SERVICE** | Exercised via service/actions/offline processor without dedicated browser click-through |
| **DOCS** | Documented behavior / deferred with explicit rationale |
| **PRIOR GATE** | Covered by an existing browser gate that must remain green |

Do **not** relabel SERVICE/SQL as BROWSER.

## Summary counts

| Class | Count | Notes |
|-------|-------|-------|
| BROWSER | 22 | Builder, Job Flow, supervisor, offline, Phase 10A strengthen, FA deny |
| BROWSER SELECTOR SCOPE | 1 | Foreign Vendor absent from Facility selector (#66) |
| SQL | 18 | Publish/version, derive, complete/idempotency, Not Required, reopen, one-off, flag isolation, WO status residual |
| HERMETIC | 8 | Authority, requirement states, `/assets` nav, projection flag default |
| SERVICE | 10 | Offline sync processor paths, bundle workContext, linked Evidence satisfaction |
| DOCS | 6 | EACH deferred, Procedure versioning limits, Engine/Task isolation, projected workspace retain |
| PRIOR GATE | 12 | Existing assignment/offline/pilot/cycles/job-flow/evidence/asset gates (#71–77 plus overlaps counted in themes) |

Theme groups below assign the primary classification per scenario (exactly 77).

---

## Ownership / isolation (1–8)

| # | Scenario | Class | Evidence |
|---|----------|-------|----------|
| 1 | Manager opens Department Work Plans | BROWSER | `work-plan-builder` on `/staffing/work-plans` |
| 2 | Manager creates blank Work Plan | BROWSER | `create-work-plan` |
| 3 | Manager adds a Work Item | BROWSER / SQL | Builder panel item add; SQL publish path covers item persistence |
| 4 | Manager selects Dietary Unit / Space applicability | BROWSER / SQL | Builder applicability fields; SQL draft update |
| 5 | Manager selects an Operational Cycle | BROWSER / SQL | Item timing cycle key |
| 6 | Manager configures a fixed-window Work Item | SQL / SERVICE | Timing mode on Work Item service |
| 7 | Manager configures priority | BROWSER / SQL | Builder priority control |
| 8 | Manager configures responsibility behavior | HERMETIC / SQL | `UNIT_SHARED` Runtime; enum includes deferred EACH |

## Builder publish / Procedure (9–12)

| # | Scenario | Class | Evidence |
|---|----------|-------|----------|
| 9 | Manager links a Procedure | BROWSER / SQL | Procedure link on item; KnowledgeArticle id snapshot |
| 10 | Manager previews representative operational day | BROWSER / SERVICE | Builder preview |
| 11 | Manager publishes Work Plan | BROWSER | `publish-work-plan` |
| 12 | Draft Work does not appear to frontline Employee | SQL / HERMETIC | Requirements only from PUBLISHED + confirmed Assignment |

## Job Flow / completion (13–25)

| # | Scenario | Class | Evidence |
|---|----------|-------|----------|
| 13 | STAFF authenticates through Quick PIN | PRIOR GATE / BROWSER | Existing PIN/unit flow; Phase 11A strengthens Issue path via session staff |
| 14 | Employee Job Flow displays current Work | BROWSER | `job-flow-work-requirements` |
| 15 | Current Assignment remains separately visible | BROWSER / PRIOR GATE | Job Flow assignment strip unchanged ownership |
| 16 | Current Operational Cycle remains separately visible | BROWSER / PRIOR GATE | Cycle cards remain independent |
| 17 | Employee sees linked Procedure | BROWSER / SERVICE | `work-procedure-panel` |
| 18 | Opening Procedure does not complete Work | HERMETIC / SERVICE | Viewing ≠ completion; no complete event on open |
| 19 | Employee explicitly completes Work | BROWSER | `complete-work` |
| 20 | Completion updates Job Flow | BROWSER | Post-complete notice / strip refresh |
| 21 | Completion records Employee and timing | SQL | Occurrence + event actor/timestamps |
| 22 | Completed Work remains historically visible | SQL | Occurrence COMPLETED + events append-preserving |
| 23 | Second submission does not duplicate completion | SQL / SERVICE | Idempotent complete + offline command id |
| 24 | Future Work appears as upcoming | SERVICE / BROWSER | Upcoming queue in Job Flow projection |
| 25 | Past-due unconfirmed uses neutral language | HERMETIC / BROWSER | `PAST_DUE_NOT_CONFIRMED` copy — not “failed” |

## Supervisor (26–36)

| # | Scenario | Class | Evidence |
|---|----------|-------|----------|
| 26 | Supervisor Board displays Work summary | BROWSER | `supervisor-work-actions` / Work group |
| 27 | Supervisor sees Past Due / Not Confirmed Work | SERVICE / BROWSER | Exception projection from requirements |
| 28 | Supervisor marks Work Not Required with reason | BROWSER / SQL | Not Required action + reason; SQL assert plan unchanged |
| 29 | NOT_REQUIRED does not modify published Work Plan | SQL | Occurrence state only |
| 30 | Supervisor reopens an occurrence | SQL / SERVICE | `reopenOccurrence` |
| 31 | Reopen preserves completion history | SQL | Append-preserving events |
| 32 | Supervisor creates one-off urgent Work | BROWSER | `create-one-off-work` |
| 33 | Employee sees the one-off Work | SERVICE / BROWSER | Requirement projection includes ONE_OFF |
| 34 | Employee completes one-off Work | SQL / BROWSER | Complete path on one-off occurrence |
| 35 | Task-level reassignment works when implemented | SQL / SERVICE | `reassignOccurrence` |
| 36 | Operational Assignment unchanged after reassignment | SQL | Assignment row untouched |

## Evidence relationship (37–39)

| # | Scenario | Class | Evidence |
|---|----------|-------|----------|
| 37 | Linked Evidence Work opens authoritative Evidence form | SERVICE / BROWSER | Completion panel Evidence path |
| 38 | Accepted Evidence satisfies linked Work | SQL / SERVICE | LINKED_EVIDENCE completion |
| 39 | Evidence conflict does not falsely complete Work | SQL / SERVICE | Rejected/conflict Evidence ignored |

## Versioning / retire (40–44)

| # | Scenario | Class | Evidence |
|---|----------|-------|----------|
| 40 | Manager creates successor Work Plan Draft | SQL / BROWSER | Successor draft from published |
| 41 | Manager publishes successor | SQL | Prior published retired on supersede |
| 42 | Historical completion retains original Work Item version | SQL | Occurrence references published plan id + itemKey |
| 43 | Manager retires Work Plan | SQL | `retireWorkPlan` |
| 44 | Retired Plan stops prospective Work | SQL / HERMETIC | Resolve skips RETIRED |

## Offline (45–55)

| # | Scenario | Class | Evidence |
|---|----------|-------|----------|
| 45 | Employee loads scoped Work online | BROWSER / SERVICE | Runtime bundle `workContext` |
| 46 | Browser goes offline | BROWSER | Playwright offline helper |
| 47 | Employee completes explicit Work offline | BROWSER | `complete-work-offline` |
| 48 | UI shows Saved on This Tablet | BROWSER | `work-offline-status` |
| 49 | Refresh preserves pending completion | SERVICE / PRIOR GATE | Offline queue patterns (IndexedDB) |
| 50 | Browser restart preserves pending completion | SERVICE / PRIOR GATE | Same offline persistence contract |
| 51 | Reconnect synchronizes exactly once | SERVICE | Sync engine + command idempotency |
| 52 | Response-loss replay does not duplicate completion | SERVICE / SQL | Idempotent process-sync |
| 53 | User change isolates pending Work | SERVICE | Offline user-change isolation |
| 54 | Unit rebind does not retarget pending Work | SERVICE | Command retains original unitId |
| 55 | Reassignment while stale/offline conflicted | SERVICE / SQL | Conflict review path |

## Authority (56–59)

| # | Scenario | Class | Evidence |
|---|----------|-------|----------|
| 56 | STAFF cannot access Work Plan Builder | HERMETIC / BROWSER | Authority + route MANAGER+ |
| 57 | STAFF cannot access Supervisor Work manage | HERMETIC / SERVICE | Supervisor actions gated |
| 58 | FA without Dietary authority denied | BROWSER | `work-plan-builder-denied` / redirect |
| 59 | Cross-Facility Work identifiers rejected | SQL / HERMETIC | Facility scope checks |

## Phase 10A residual closures (60–70)

| # | Scenario | Class | Evidence |
|---|----------|-------|----------|
| 60 | `/assets` appears in Dietary navigation when authorized | HERMETIC | `workspace-composition` + `business-workspace.test.ts` — **CLOSED** |
| 61 | Quick PIN STAFF reports Asset Issue through UI | BROWSER | work-plans + asset gates — **CLOSED** |
| 62 | Supervisor/Manager opens Work Order through UI | BROWSER | asset-operations `create-work-order` / linked WO |
| 63 | Work Order moves through supported lifecycle using UI controls | BROWSER + SQL | Create/open BROWSER; status steps SQL residual |
| 64 | Completed WO does not auto-return Asset to service | SQL | Assert status remains OOS after COMPLETED |
| 65 | Manager explicitly returns Asset to service | SQL / BROWSER | `RETURN_TO_SERVICE` history + asset profile |
| 66 | Foreign Vendor absent from Facility-scoped selector | BROWSER SELECTOR SCOPE | Facility vendors only in selector |
| 67 | Foreign Vendor ID rejection retained at service/SQL | SQL / SERVICE | **RETAINED WITH CLASSIFICATION** |
| 68 | Evidence opens related Asset Issue where supported | BROWSER / SERVICE | Log Book / Issue link surfaces |
| 69 | Asset Issue opens supporting Evidence where supported | BROWSER | `link-evidence-id` / `issue-evidence-links` |
| 70 | Projected Unit Workspace Asset parity | DOCS / HERMETIC | **RETAINED** — `PROJECTION_UNIT_WORKSPACE_ENABLED` default false |

## Prior gates remain green (71–77)

| # | Scenario | Class | Evidence |
|---|----------|-------|----------|
| 71 | Assignment browser remains green | PRIOR GATE | `test:assignment-browser` |
| 72 | Offline browser remains green | PRIOR GATE | `test:offline-browser` |
| 73 | Dietary pilot remains green | PRIOR GATE | `test:dietary-pilot` |
| 74 | Operational Cycles browser remains green | PRIOR GATE | `test:operational-cycles-browser` |
| 75 | Job Flow browser remains green | PRIOR GATE | `test:job-flow-browser` |
| 76 | Operational Evidence browser remains green | PRIOR GATE | `test:operational-evidence-browser` |
| 77 | Asset Operations browser remains green | PRIOR GATE | `test:asset-operations-browser` |

Plus Phase 11A gate: `test:work-plans-browser` (covers many BROWSER rows above).

## Certification recommendation

**Conditionally certify Phase 11A** once validation matrix is green and docs accepted.

Do **not** enable on production/`ltc_manager` without a separate ACT decision.
