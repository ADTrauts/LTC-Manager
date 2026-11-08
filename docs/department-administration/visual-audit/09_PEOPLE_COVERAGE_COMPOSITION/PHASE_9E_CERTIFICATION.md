# Phase 9E — PR #7 CI closure

**Date:** 2026-11-08  
**Branch:** `department-builder/people-coverage-composition`  
**PR:** https://github.com/ADTrauts/LTC-Manager/pull/7  
**HEAD at start:** `f692ab2` (docs-only after product tip `fb59888`)

## First observation (`f692ab2`)

| Run | Role | Result |
| --- | --- | --- |
| [42492918644](https://github.com/ADTrauts/LTC-Manager/actions/runs/42492918644) | pull_request | 4/5 green; Database integration failed |
| [42492914329](https://github.com/ADTrauts/LTC-Manager/actions/runs/42492914329) | push twin | Database integration failed |

Reported Database failures on the first PR observation:

1. `an expired snooze wakes once, and a cleared or old window does not`
2. `SQL workbook: own shared-parent location commits permit safe child refresh while failed receipt history survives`

## Rerun of failed Database job only

Reran failed jobs on run `42492918644` (new Database job `128808068695`).

| Outcome | Detail |
| --- | --- |
| Snooze wake | **Failed again** — `PushDispatch` rows left `QUEUED` (not `SENT`/`SUPPRESSED`) when peer suites cleared process-global `WEB_PUSH_SENDING_ENABLED` mid-flight |
| Workbook shared-parent | **Did not reproduce** (passed on rerun and on push twin) |
| Fail count | `# fail 1` of 3953 |
| P2034 | Onboarding import logs show PostgreSQL serialization retries under parallel disposable load; workbook suites recovered |

## Defect correction (no assertion weaken)

- Restored `status === "SENT"` (removed the earlier `SUPPRESSED` allowance).
- After concurrent snooze-wake enqueue, re-enable `WEB_PUSH_SENDING_ENABLED` and drain via `deliverQueuedPushDispatches` so SENT remains the contract under parallel CI.

Workbook shared-parent is classified as intermittent under parallel disposable DB / P2034 contention; no product change.

## Merge stance

Do **not** merge without separate product-owner authorization. Phase 9E closes CI for PR #7 after the corrective push below lands green.
