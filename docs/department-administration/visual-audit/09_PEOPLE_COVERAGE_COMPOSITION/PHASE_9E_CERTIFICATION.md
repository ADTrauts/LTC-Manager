# Phase 9E — PR #7 CI closure

**Date:** 2026-11-08  
**Branch:** `department-builder/people-coverage-composition`  
**PR:** https://github.com/ADTrauts/LTC-Manager/pull/7  
**Certified HEAD:** `fdee5a3`  
**Product tip (Phase 9D):** `fb59888`  
**Docs-only tip that first went red:** `f692ab2`

## Verdict

All five required Verify jobs are green on `fdee5a3`. PR #7 is **MERGEABLE** / **CLEAN**. Do **not** merge without separate product-owner authorization.

## Certified Verify run

| Field | Value |
| --- | --- |
| Run | [42510147597](https://github.com/ADTrauts/LTC-Manager/actions/runs/42510147597) |
| HEAD | `fdee5a352e2974e4b23b116a8b232b8910b4d286` |
| Conclusion | **success** |

| Job | Conclusion |
| --- | --- |
| Static and hermetic | success |
| Database integration | success |
| Assignment browser gate | success |
| Dietary pilot gate | success |
| Offline browser gate | success |

## First observation (`f692ab2`)

| Run | Role | Result |
| --- | --- | --- |
| [42492918644](https://github.com/ADTrauts/LTC-Manager/actions/runs/42492918644) | pull_request | 4/5 green; Database integration failed |
| [42492914329](https://github.com/ADTrauts/LTC-Manager/actions/runs/42492914329) | push twin | Database integration failed |

Reported Database failures:

1. `an expired snooze wakes once, and a cleared or old window does not`
2. `SQL workbook: own shared-parent location commits permit safe child refresh while failed receipt history survives`

## Rerun of failed Database job only

Reran failed jobs on run `42492918644` (new Database job `128808068695`).

| Outcome | Detail |
| --- | --- |
| Snooze wake | **Failed again** |
| Workbook shared-parent | **Did not reproduce** (passed on rerun and later push runs) |
| Fail count | `# fail 1` of ~3953 |
| P2034 | Onboarding import logs show PostgreSQL serialization retries under parallel disposable load; workbook suites recovered |

## Root cause (snooze wake)

Shared disposable Postgres + parallel SQL suites:

1. Peer suites cleared process-global `WEB_PUSH_SENDING_ENABLED` mid-flight (fixed with ALS pin).
2. Peer suites called `deliverQueuedPushDispatches` with a synthetic far-future `now` and **unscoped** bulk expire, marking other suites’ live `PushDispatch` rows `FAILED:expired`.

Workbook shared-parent is intermittent under parallel disposable DB / P2034 contention; no product change.

## Defect correction (assertions kept strict)

| Commit | Change |
| --- | --- |
| `01af5d7` | Drain after concurrent snooze-wake enqueue; restore `SENT` strictness |
| `1156131` | Pin Web Push sending per async chain (`runWithWebPushSendingEnabled` ALS) |
| `48ade05` | Release orphaned SENDING claims after interrupted delivery |
| `d30f924` | Scope expire/claim to Facility when facility IDs are known |
| `fdee5a3` | Unscoped bulk expire is a no-op; Facility-scoped expire is **windowed** to the caller’s clock (`expiresAt` in `(now − TTL, now]`); external delivery passes discovered Facilities into the drain; snooze-wake may briefly restore+drain before asserting `SENT` |

No People & Coverage redesign. No assertion weaken to allow `SUPPRESSED`/`FAILED` as success.

## Prior red Verify runs on this branch (post-`fb59888`)

| Run | HEAD | Database |
| --- | --- | --- |
| [42492918644](https://github.com/ADTrauts/LTC-Manager/actions/runs/42492918644) | `f692ab2` | failed (snooze + workbook on first observation) |
| [42506490095](https://github.com/ADTrauts/LTC-Manager/actions/runs/42506490095) | `01af5d7` | failed (snooze) |
| [42507276266](https://github.com/ADTrauts/LTC-Manager/actions/runs/42507276266) | `1156131` | failed (snooze) |
| [42508172417](https://github.com/ADTrauts/LTC-Manager/actions/runs/42508172417) | `48ade05` | failed (snooze `FAILED:expired`) |
| [42509046296](https://github.com/ADTrauts/LTC-Manager/actions/runs/42509046296) | `d30f924` | failed (snooze `SENT\|FAILED:expired`; workbook passed) |
| [42510147597](https://github.com/ADTrauts/LTC-Manager/actions/runs/42510147597) | `fdee5a3` | **success** |

## Merge stance

PR #7 is mergeable with five green required checks at `fdee5a3`. Phase 9E **does not merge**; product owner authorizes merge separately.
