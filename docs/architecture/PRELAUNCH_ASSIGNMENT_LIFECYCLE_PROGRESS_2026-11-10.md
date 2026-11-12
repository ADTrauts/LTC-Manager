# Vssyl pre-launch — Assignment lifecycle checkpoint

Local application commit: `017f573e0fcce5d7bf796ff9f6c2b60d6b47b546`, branch `architecture/prelaunch-canonical-consolidation`. No push, deployment, active production schema change or connection replacement occurred.

## Implemented

Useful ONE_OFF instructions, completion, authorized reopen and offline receipt behavior now have a verified path under the existing Workforce Assignment owner. The actual Assignment form requires an employee, operational registry role and real location. Instructions use Assignment notes (up to 4,000 characters). Status and append-only Assignment events own completion/reopen; no generic task store or new lifecycle table was introduced.

Supervisor actions, employee completion and offline replay share `transitionAssignment`. It validates current session authority, owning Department, employee ownership, confirmed plan, exact revision, responsibility window, location and PIN device scope. Reopen requires authority/reason, checks eligibility and overlap, and appends history. Replacement cancellation and new creation share a transaction and owning Department/date. Coverage observes the final replacement delta. Published Coverage application now uses the shared Assignment attention/episode pipeline.

Employee Space/Neighborhood UI shows instructions and a completion action, then today's completed Assignments after reload. The supervisor board exposes a reason-required reopen action in completed history. The canonical encrypted Space-offline protocol supports an Assignment completion target with the existing bounded queue, issuance, authority checks, intent digest and immutable receipt. A local action remains pending until the server commits. Retry/reconciliation reuses the same receipt; a reopened/changed Assignment invalidates old intent.

Actual browser execution uncovered an application-wide transaction detection defect: the lazy Prisma proxy forwarded method reads but not `in` checks. Services misidentified the root application client as a transaction client. The proxy now forwards `has`; a database regression through the actual application client verifies that status, event and attention commit together. Direct standalone Prisma tests alone had not exposed this defect.

The browser fixture now has a real Floor → Neighborhood → Space hierarchy. Offline authority continues to require it; no authorization guard was weakened to admit a legacy null-hierarchy demo Unit.

## Verification

| Check | Result |
|---|---|
| Production build, including TypeScript | PASS |
| Full hermetic run | 4,007 tests: 3,684 passed, 323 opt-in skips, **0 failures** |
| Assignment/Coverage SQL regressions | 14 reported tests passed, 0 failures |
| Focused notification/flow/offline/authority checks | 57 passed; overlaps the full hermetic run |
| Actual production-build browser workflows | 3 passed, 31.3 seconds |
| Focused ESLint and staged whitespace check | PASS |

Browser evidence covers People & Coverage publication → real Space Assignment creation → stored/reloaded location and instructions → actual RLS/Dashboard gap closure; Employee Builder Team rooms → authorized Team maintenance view; and employee password login → online completion → stored history → supervisor reopen → real device binding and offline preparation → disconnect → pending local completion → reconnect/synchronize → one receipt → repeated sync without another effect → return to live Space and completed history. No page errors were recorded by the Coverage or Assignment lifecycle tests. Canceled response streams still appear in server navigation logs.

SQL tests include unassigned/foreign/changed-authority/PIN-device denial, draft/closed plans, time windows, membership removal, replacement rollback, concurrent completion, changed intent, receipt-storage rollback, lost committed-response reconciliation, reopened Assignment stale intent, and the real application-client transaction boundary.

A separately run older Space-offline SQL suite reported nine failures in its obsolete Work Plan fixture assumptions: it expects no Work occurrences even though the current fixture creates ONE_OFF rows, updates a retired Work Plan using an occurrence-id alias, or changes Work Item configuration that no longer owns those ONE_OFF rows. This is not a green release receipt. Its remaining authorization, expiry, Key Point and recovery scenarios must be preserved on canonical Assignment/Key Point fixtures during Work retirement. The full hermetic run skips SQL-backed suites; those skips are not counted as passes.

## Remaining work

The old Work owner is still present. Remove its runtime contributors, forms/routes/APIs, presets/catalog entries, old command payloads and persistence after finishing the remaining scope cases. Required hardening includes closed-plan offline advertising, clear whole-Assignment scope for offline completion, Department responsibility filtering of Unit-wide room projections, and preventing one employee's multiple Assignment rows from inflating Coverage headcount.

ARR-003 remains open for actual generic Work removal. ARR-004 remains open for remaining classification readers/type overlays/schema. ARR-008 remains open for duplicate Job Role employee/import/workbook/editor dependencies. The final Prisma baseline, minimal owner seed, PostgreSQL 18 verification and remaining vertical workflows are not complete. The local verification database still uses the transitional historical migration chain on PostgreSQL 14.18.

Retained Neon CLI access is verified under `vssyl-retained` for `org-hidden-leaf-35421142`, production `damp-hill-35484256` and staging `raspy-mode-86368121`. No new provider database/branch has been created yet. Empty certification organization/login retirement and the previously archived Phase 8.3 Records/PDF assessment remain tracked. The single coordinated production cutover checkpoint is still required after the final application, database and owner access are concretely verified.
