# Phase 9D — PR certification

**Date:** 2026-11-08  
**Branch:** `department-builder/people-coverage-composition`  
**PR:** https://github.com/ADTrauts/LTC-Manager/pull/7  
**Certified tip:** `fb59888f7778418cef664dacb4c8435732193874`  
**Phase 9C tip (pre-merge):** `910578e`  
**Merged base:** `origin/main` @ `e179c0d` (Notifications + production schema restore)

**Not merged.** No force-push. Unrelated worktrees left alone.

## Required Verify jobs

GitHub Actions run: https://github.com/ADTrauts/LTC-Manager/actions/runs/42492142685

| Job | Result |
| --- | --- |
| Static and hermetic | SUCCESS |
| Database integration | SUCCESS |
| Offline browser gate | SUCCESS |
| Assignment browser gate | SUCCESS |
| Dietary pilot gate | SUCCESS |

## What this PR keeps

- Explicit-space Coverage (`spaceId` on Coverage template items; forward migration after restore).
- Org-only Teams (no OT/room Team model from restore).
- People & Coverage composition from Phase 9C.
- Notifications live publish path for `evidence.failed` (restored after merge).
- Work / job-role / Location Function restore debt classified in write-manifest where surfaces still exist; tip IA tests aligned or removed where they conflicted with restore.

## Merge repair notes (CI only)

- Session denylist lookup: missing `jti` skips denylist (does not invalidate); signed JWTs still mint `jti`.
- Disposable SQL fixtures: parallel `user.count`, shared evaluation lease cursor, and `WEB_PUSH_SENDING_ENABLED` races softened where they are process-global.
- Plant starter asserts follow Records-only starter (generic Work presets retired from Plant starter).

## Merge

Do **not** merge without a separate product-owner authorization.
