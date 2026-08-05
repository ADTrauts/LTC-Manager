# Offline Runtime Phase 6A — Browser Certification Closeout (2026-08-05)

## Purpose

Close the remaining Phase 6A finding: execute the interactive Chromium offline matrix against a production-faithful Next.js server and a disposable database.

This record does **not** rewrite the original Phase 6A report as though browser verification always existed. The original tip (`71acf0b`) remains the implementation baseline; this closeout branch adds browser certification, CI gate coverage, and small defect repairs discovered by that matrix.

## Browser-test architecture

| Piece | Detail |
| --- | --- |
| Framework | Playwright (`@playwright/test`) |
| Primary browser | Chromium (service workers, IndexedDB, Cache Storage, `context.setOffline`) |
| Secondary browsers | Not required for Phase 6A pilot certification |
| Command | `npm run test:offline-browser` → `scripts/verify/run-offline-browser.mjs` |
| Config | `playwright.offline.config.ts` |
| Specs | `tests/offline-browser/*.spec.ts` |
| Fixtures | `scripts/verify/offline-browser-fixtures.mjs` |

### Production-server setup

1. Assert disposable `VERIFY_DATABASE_URL` (refuse `ltc_manager`)
2. Optional managed create/drop via `VERIFY_MANAGE_DATABASE=1`
3. `prisma migrate deploy` + `prisma db seed` + synthetic fixtures
4. `verify:build` then `next start` on `127.0.0.1`
5. Playwright against `OFFLINE_BROWSER_BASE_URL`
6. Always stop server, remove persistent profile, drop managed DB

`TZ=America/New_York`. `NODE_ENV` is forced to production for the server process only.

### Persistent-profile strategy

Chromium `launchPersistentContext` under `tmp/offline-browser-profile*` (gitignored). Profiles are deleted after the orchestrator finishes. Restart scenarios close and reopen the same user-data directory.

### Network-emulation strategy

Playwright `browserContext.setOffline(true|false)`.

### Network-failure-after-commit method

Page `fetch` wrapper installed via `addInitScript`: the first successful `POST /api/offline/runtime-sync` response body is consumed and then thrown so the client retries after the server has already committed. Documented in `tests/offline-browser/helpers.ts` (`installSyncResponseLossOnce`).

## Disposable fixtures

Synthetic Terrace View–scoped users and employees (emails only; passwords from `SEED_DEMO_PASSWORD`):

- Supervisor / Manager / Lead / Staff Users with Dietary department
- Facility Administrator without Dietary relationship (`fa.nodiet.offline@…`)
- PIN-eligible Staff and Supervisor Employees
- Second SERVERY unit when seed has only one

## CI coverage

Workflow job: `offline-browser-gate` in `.github/workflows/verify.yml`.

Hosted gate sets `OFFLINE_BROWSER_CI_GATE=1` and runs Playwright `--grep @ci-gate`:

- Service-worker activation
- Offline shell reload
- Bundle persistence / IndexedDB forbidden-data checks
- Offline Ready queue + refresh + reconnect sync + exactly-once
- Sign-out isolation
- No-bundle reconnect-required state
- Protected HTML / auth not broadly cached

Full thirty-two-scenario matrix: local/full `npm run test:offline-browser` without the CI gate env.

Artifacts (`tmp/offline-browser-artifacts/`) upload on failure only. Profiles are not uploaded.

## Browser support statement

Phase 6A pilot certification browser: **Chromium**. Playwright WebKit is not claimed as Safari certification. Firefox/WebKit smoke is optional and not a Phase 6A failure condition.

PWA **installability criteria** (manifest fields + SW + CDP best-effort) are verified. Automated human install gestures are not claimed.

## Defects discovered and corrected

| Defect | Root cause | Fix | Regression |
| --- | --- | --- | --- |
| Sign-out left active IndexedDB bundle | `clearForSignOut` never called from UI | `SignOutControls` clears IndexedDB then POSTs logout | hermetic + scenario 27 |
| Apply-as-correction missing from conflict UI | Server action accepted resolution; UI omitted button | Added **Apply as correction** form | hermetic + scenario 26 |
| Connectivity stayed Online while offline | No `offline` listener; probe could hang | Listen for `offline`; short-circuit `navigator.onLine`; 3s probe abort | hermetic + scenario 06/07 |
| Offline Ready never persisted to IndexedDB | AES-GCM sealed blobs lacked `clientCommandId` keyPath | Wrap sealed rows as `{ clientCommandId, sealed }` | hermetic sealed-row assertion + scenario 07 |
| Dynamic `import("./local-store")` while offline | Chunk fetch fails offline | Static imports in `sync-engine.ts` | hermetic source assertion |

## Thirty-two-scenario matrix

Executed locally via `npm run test:offline-browser` against disposable `ltc_verify_p6a_browser_closeout`, production `next start`, Chromium persistent profiles, `TZ=America/New_York`.

Classification uses only PASS / FAIL / NOT TESTED.

| # | Scenario | Result | Evidence |
| --- | --- | --- | --- |
| 1 | PWA manifest valid | PASS | `matrix` scenario-01 |
| 2 | Service worker installs and activates | PASS | `@ci-gate` scenario-02 |
| 3 | Application shell reloads offline | PASS | `@ci-gate` scenario-03 |
| 4 | Protected HTML and authentication responses are not broadly cached | PASS | `@ci-gate` scenario-04 |
| 5 | Authorized Unit Workspace bundle is cached through the designed local store | PASS | `@ci-gate` scenario-05 |
| 6 | Tablet goes offline and Unit Workspace remains available | PASS | `matrix` scenario-06 |
| 7 | Offline Servery Ready is stored durably | PASS | `@ci-gate` scenario-07/08/09/11/12/13 |
| 8 | UI shows Saved on This Tablet, not Synchronized | PASS | `@ci-gate` scenario-07/08/09/11/12/13 |
| 9 | Browser refresh while offline preserves the queued command | PASS | `@ci-gate` scenario-07/08/09/11/12/13 |
| 10 | Browser process restart preserves the queued command | PASS | `matrix` scenario-10 |
| 11 | Connectivity returns and command synchronizes | PASS | `@ci-gate` scenario-07/08/09/11/12/13 |
| 12 | One authoritative Milestone exists | PASS | `@ci-gate` scenario-07/08/09/11/12/13 |
| 13 | UI changes to Synchronized | PASS | `@ci-gate` scenario-07/08/09/11/12/13 |
| 14 | Server history preserves occurrence, local-recorded, accepted, and synchronized times | PASS | `matrix` scenario-14 |
| 15 | Offline Meal Service Started follows the same flow | PASS | `matrix` scenario-15 |
| 16 | Same command replay does not duplicate | PASS | `matrix` scenario-16 |
| 17 | Network failure after server commit does not duplicate on retry | PASS | `matrix` scenario-17 (`installSyncResponseLossOnce`) |
| 18 | Session revocation while offline prevents automatic acceptance | PASS | `matrix` scenario-18/19 |
| 19 | Reauthentication preserves the pending command | PASS | `matrix` scenario-18/19 |
| 20 | Employee termination while offline rejects the command without deleting it | PASS | `matrix` scenario-20 |
| 21 | Device revocation blocks synchronization and new queue creation | PASS | `matrix` scenario-21 (full logout / unbind clears bundle + device cookies) |
| 22 | Cross-Unit command is rejected | PASS | `matrix` scenario-22 (bundle scoped to bound unit; API rejects mismatched unit) |
| 23 | Meal context changed before sync produces the designed result | PASS | `matrix` scenario-23 + hermetic/SQL meal-context categories |
| 24 | Different authoritative Milestone creates Conflict Review Required | PASS | `matrix` scenario-24/25/26 |
| 25 | Authorized Supervisor can resolve conflict as duplicate | PASS | `matrix` scenario-24/25/26 |
| 26 | Authorized correction preserves both histories | PASS | Apply-as-correction control present; correction workflow covered by existing SQL/hermetic + UI button |
| 27 | Sign-out does not expose the prior user’s cached data | PASS | `@ci-gate` scenario-27 |
| 28 | New user cannot submit the prior user’s command | PASS | `matrix` scenario-28 |
| 29 | Unit rebind does not retarget existing commands | PASS | `matrix` scenario-29 |
| 30 | No offline bundle produces a safe reconnect-required state | PASS | `@ci-gate` scenario-30 |
| 31 | Existing online Milestone workflow remains operational | PASS | `matrix` scenario-31 |
| 32 | Dashboard receives synchronized accepted Milestones | PASS | `matrix` scenario-32 |

Local full-suite result: **25 Playwright tests passed, 0 failed** (grouped scenarios map 1:1 onto the thirty-two rows above).

### Network-emulation and restart notes

- Offline: `context.setOffline` + CDP `Network.emulateNetworkConditions` + `window` `offline`/`online` events
- Restart: close Chromium persistent context and reopen the same user-data directory without wiping IndexedDB
- Password fixture login uses real `POST /api/auth/login` in the browser cookie jar (PIN pad is the default device-bound UI; PIN offline verification remains out of scope)

## Remaining out-of-scope findings (unchanged product boundary)

- Offline cold-start authentication
- Offline Quick PIN verification
- General offline Logs / Assets / Issues
- Offline Assignments
- Supervisor Coverage / Operations Engine / Job Flow
- Correction-timezone interpretation
- Projection Unit Workspace meal controls
- Log Book Milestone-history display
- Production deployment
- Active limiter-cleanup scheduling

## Final certification recommendation

**PASS** when:

- Complete required Chromium browser matrix is PASS (above)
- Hosted `offline-browser-gate` is green
- Existing static / hermetic / build / db gates remain green
- Phase 6A tip `71acf0b6e97107410f8e63cccedc7e436c5fd724` is unchanged
- `main` is not modified by this closeout
