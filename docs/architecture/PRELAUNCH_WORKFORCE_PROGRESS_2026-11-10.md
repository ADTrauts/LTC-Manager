# Vssyl pre-launch consolidation — Workforce progress

Application checkpoint: `788e7141dd0aba6ed2621a6c0ca723f76867273e` on `architecture/prelaunch-canonical-consolidation`. This is local progress toward the full consolidation; it is not a production release or completed legacy retirement.

## Retained Neon access resolved

The `vssyl-retained` CLI profile is verified as `trautman.andrew.d@gmail.com`, user `2eac2005-3d14-4062-86f8-a1b0b705b3a9`. It lists production `damp-hill-35484256` and staging `raspy-mode-86368121` under retained organization `org-hidden-leaf-35421142`. Both projects use PostgreSQL 18. Production has only `main`, `br-odd-cloud-avkhc7m6`, in the latest branch inventory. No new retained branch/database or production mutation has occurred.

The earlier login repeatedly completed against the certification browser session before the correct-account consent was reached. A process-local browser-launch override allowed the normal Neon CLI OAuth flow to use the owner-authorized retained account. No manually created API key or credentials in chat were needed. Retained operations explicitly select this profile and project; the old profile is not a safe implicit destination.

The obsolete certification Neon/Vercel projects remain deleted. The empty old Neon organization and its independent login still require safe supported account-management retirement; their deletion is not claimed.

## Implemented and verified

- Assignment creation/editing requires an explicit registry role and active Department employee. Titles, old Job Role tiers, Teams and platform roles do not supply operational eligibility. The server consumes explicit active qualifications; an authorized exception requires a reason and appends an Assignment event without creating a qualification.
- The actual Assignment form filters employees by the selected role and exposes explicit Rooms/Spaces for Dietary as well as EVS. The server retains those selections and rejects missing, inactive, foreign or non-responsible places.
- Published Coverage application reads its real persisted item, checks publication/effectiveness and eligibility, persists the actual Space and canonical role label, uses the Facility timezone, and attaches the daily Assignment plan. Wrong Department, draft/future and unqualified controls fail closed. Repeated application creates no duplicate placement.
- Coverage preview/fulfillment no longer treats a missing target or another Space as a match. The Assignment board now passes persisted Space IDs and responsibility windows into the canonical Coverage evaluator. Applying Coverage uses Department authority and reports created/skipped results.
- Opening the Assignment board no longer creates a plan as a GET side effect. Department board reads require Department-view authority.
- Removed the unused 897-line profile authoring service and obsolete Location Function action stubs. Their old source-inspection tests and write-manifest entries were removed or reconciled. Old Records tests now preserve explicit-grain targeting and assert that retired type overlays do not invent room obligations.

## Evidence

| Check | Result |
|---|---|
| Full hermetic discovery/run | 3,999 tests: 3,684 passed, 315 skipped, **0 failed** |
| New disposable database regression | 6 passed; explicit qualification/exception/location and persisted Coverage application |
| Focused qualification/Coverage/Assignment/write-manifest checks | 111 passed, 0 failed; overlap with full hermetic run |
| Retired-contract checks | 27 passed, 0 failed; overlap with full hermetic run |
| Actual production-build browser workflows | 2 passed, 55.6 seconds |
| Standalone TypeScript check | PASS |
| Focused ESLint | PASS |
| Production build | PASS; later changes were test fixtures/assertions and removal of obsolete write-manifest entries |
| Source whitespace check | PASS |

The browser test creates/publishes Unit and Space requirements through People & Coverage, then uses the real Assignment form to place an explicitly qualified employee in that Space for today and the future effective date. Reload preserves role, instructions and exact Space. The board and actual RLS show 2 required / 2 assigned / covered; the actual Dashboard changes from one Coverage gap to zero. The Team workflow separately saves explicit room membership in Employee Builder and verifies an independently populated in-room maintenance fact, excluding an unrelated room. Fixture setup uses the existing disposable database and existing test framework.

This does not count the 315 skipped SQL-backed/opt-in tests as passed. The local database remains PostgreSQL 14.18 with the transitional 189-migration chain, not the final PostgreSQL 18 baseline. Browser navigation still sometimes logs a canceled response stream; the Coverage regression records no page errors.

## Remaining implementation

The ONE_OFF rehome is not complete: employee Assignment completion, authorized reopen, instructions presentation and offline replay/receipt/conflict behavior must share the Assignment owner before generic Work is removed. The existing reassignment path also cancels a replacement target before creation succeeds; this must become atomic and Department-scoped while its lifecycle is consolidated.

Department Job Role editor/import/workbook dependencies, remaining classification readers/type overlays, generic Work services/schema, final baseline/minimal owner seed and the remaining vertical workflows are still outstanding. ARR-003, ARR-004 and ARR-008 remain open for those actual dependencies. No new product decision is needed for their authorized removal.

No push, deployment, public promotion, active production reset or connection replacement occurred. The single coordinated cutover checkpoint remains required once the final application, database and owner access are concretely verified.
