# Vssyl pre-launch — Generic Work runtime retirement

Canonical source: `ADTrauts/LTC-Manager`, branch `architecture/prelaunch-canonical-consolidation`, application checkpoint `adc8cf5` (November 10–11, 2026). This is a local implementation checkpoint. The production deployment, Neon project, active database connection and migration ledger were left unchanged.

## What now owns the work

- A Workforce Assignment identifies a qualified employee, a registry role and an explicit Unit or Space. It carries instructions, completion and supervisor reopen history. A qualified employee counts once per Coverage requirement even when multiple matching Assignment rows exist.
- Employee Builder now renders the operational eligibility editor on the employee card. An authorized Department head can save a registry qualification, then create a Space Assignment using the newly qualified employee. The board does not offer an unqualified employee for that role without an authorized exception.
- Space offline preparation offers Assignment completion and configured Key Point actuals. When an Assignment closes staffing responsibility, an existing receipt remains available for the same authenticated actor and issued scope. A new Key Point action still needs active responsibility. Recovery after a committed completion is review-only and does not extend the lease.
- Generic Work Plan and occurrence services, public and staff pages, presets, Dashboard and history readers, Unit offline commands and retired browser gates are removed. Plant Work Orders, Records and Operating Rhythm remain with their existing owners. The EVS room coverage overlay that inferred staffing demand from Department responsibility is removed; the Supervisor board uses published Coverage for every Department.

## Verification

- Production build, including TypeScript, passed on the disposable local environment. Lint passed on edited source and browser harness files.
- Full hermetic run: 3,850 tests, 3,533 passed, 317 opt-in database tests skipped, zero failed. Following the final receipt and editor changes, the focused retained run passed 398 tests with 53 opt-in skips.
- 27 PostgreSQL checks passed for Assignment lifecycle, exact Space scope, Key Point conflicts, concurrent and interrupted sync, immutable receipts, credential revocation and explicit recovery.
- Three rebuilt browser journeys passed. The Coverage journey saves an explicit qualification in Employee Builder, creates the eligible Space Assignment, and clears the measured Dashboard gap. The other two verify Team room scope and employee completion, supervisor reopen, and once-only offline receipt.
- Extended offline browser run: all 18 tablet and all 18 desktop scenarios passed in disposable environments. The real lost-response scenario queues the Key Point before completing the Assignment, then reconciles both persisted receipts with their original IDs. A subsequent production build passed the targeted flow on both desktop and tablet: lock the pending queue, sign back in, open the completed Space, enter review-only mode, and reconcile both receipts without enabling new offline actions.
- Two browser fixture problems were corrected: the offline suite now runs in its own disposable database so it has the one expected Facility Administrator, and exact Space Assignment verification checks the stored Space relation rather than requiring the optional Unit field.

## Remaining

ARR-003 runtime retirement is verified. Its unused Prisma tables and the historical migration path remain in the transitional database until the consolidated baseline. ARR-004 classification selectors and ARR-008 duplicate Department Job Role authoring and import data still need removal. Keep the physical Room Type picker, explicit responsible-room references, and canonical Workforce/Records/Key Point behavior.

The local historical schema inventory now includes 21 check constraints, 14 partial indexes, four trigger functions and the ID sequences that Prisma does not generate by itself. Reapply the canonical subset to the empty baseline and verify it there. No production cutover has been scheduled. Historical evidence commit `754f383` includes PDFKit font packaging and scalar response presentation absent from the current report path. Reconcile those pieces selectively during Records and Review verification; do not merge its earlier authorization or projection model wholesale.
