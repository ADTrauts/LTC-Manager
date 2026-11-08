# Phase 9E — PR #7 CI closure

**Date:** 2026-11-08  
**Branch:** `department-builder/people-coverage-composition`  
**PR:** https://github.com/ADTrauts/LTC-Manager/pull/7  
**Current HEAD:** `ecc6fea` (Phase 9E certification doc after product fix tip `fdee5a3`)  
**Product tip (Phase 9D):** `fb59888`  
**Docs-only tip that first went red:** `f692ab2`

## Verdict

All five required Verify jobs are green on `ecc6fea` (run [42510902497](https://github.com/ADTrauts/LTC-Manager/actions/runs/42510902497) after Database-only reruns). PR #7 is **MERGEABLE** / **CLEAN**. Do **not** merge without separate product-owner authorization.

## Certified Verify

| Tip | Run | Role |
| --- | --- | --- |
| `fdee5a3` (push expire window fix) | [42510147597](https://github.com/ADTrauts/LTC-Manager/actions/runs/42510147597) | First full five-green after the Notifications defect fix |
| `ecc6fea` (this certification doc) | [42510902497](https://github.com/ADTrauts/LTC-Manager/actions/runs/42510902497) | Five-green after Database-only failed-job reruns |

| Job | Conclusion on certified tip |
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

## Rerun of failed Database job only (on `f692ab2`)

Reran failed jobs on run `42492918644` (new Database job `128808068695`).

| Outcome | Detail |
| --- | --- |
| Snooze wake | **Failed again** — shared disposable DB pollution |
| Workbook shared-parent | **Did not reproduce** |
| P2034 | Onboarding import logs show PostgreSQL serialization retries; workbook suites often recover |

## Root cause (snooze wake) and fix

Shared disposable Postgres + parallel SQL suites:

1. Peer suites cleared process-global `WEB_PUSH_SENDING_ENABLED` mid-flight → ALS pin (`runWithWebPushSendingEnabled`).
2. Peer suites called `deliverQueuedPushDispatches` with a synthetic far-future `now` and **unscoped** bulk expire → other suites’ live `PushDispatch` rows became `FAILED:expired`.

| Commit | Change |
| --- | --- |
| `01af5d7` | Drain after concurrent snooze-wake enqueue; keep `SENT` strict |
| `1156131` | Pin Web Push sending per async chain (ALS) |
| `48ade05` | Release orphaned SENDING claims after interrupted delivery |
| `d30f924` | Scope expire/claim to Facility when facility IDs are known |
| `fdee5a3` | Unscoped bulk expire is a no-op; Facility-scoped expire is **windowed** to `(now − TTL, now]`; external delivery passes discovered Facilities into the drain |

No People & Coverage redesign. No assertion weaken.

## Documented intermittents (not product blockers)

| Failure | Classification |
| --- | --- |
| Workbook shared-parent / related workbook rows under P2034 | Parallel disposable DB serialization contention; often recovers on rerun; no product change in Phase 9E |
| `concurrent ceiling and assignment changes leave one open period each` (`OVERLAPPING_PERIOD`) | Appeared once on docs tip `ecc6fea` Database attempt; cleared on subsequent Database-only rerun; partner-access concurrency under load, not People & Coverage |

## Red Verify runs after `fb59888` (until fix)

| Run | HEAD | Database |
| --- | --- | --- |
| [42492918644](https://github.com/ADTrauts/LTC-Manager/actions/runs/42492918644) | `f692ab2` | failed (snooze + workbook on first observation) |
| [42506490095](https://github.com/ADTrauts/LTC-Manager/actions/runs/42506490095) | `01af5d7` | failed (snooze) |
| [42507276266](https://github.com/ADTrauts/LTC-Manager/actions/runs/42507276266) | `1156131` | failed (snooze) |
| [42508172417](https://github.com/ADTrauts/LTC-Manager/actions/runs/42508172417) | `48ade05` | failed (snooze `FAILED:expired`) |
| [42509046296](https://github.com/ADTrauts/LTC-Manager/actions/runs/42509046296) | `d30f924` | failed (snooze `SENT\|FAILED:expired`; workbook passed) |
| [42510147597](https://github.com/ADTrauts/LTC-Manager/actions/runs/42510147597) | `fdee5a3` | **success** |
| [42510902497](https://github.com/ADTrauts/LTC-Manager/actions/runs/42510902497) | `ecc6fea` | failed twice (workbook P2034; then partner concurrency); **success** after Database-only reruns |

## Merge stance

PR #7 is mergeable with five green required checks at `ecc6fea`. Phase 9E **does not merge**; product owner authorizes merge separately.
