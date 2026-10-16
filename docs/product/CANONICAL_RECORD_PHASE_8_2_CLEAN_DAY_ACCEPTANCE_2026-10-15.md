# Phase 8.2 clean-day acceptance — October 15, 2026

## Verdict

**Local clean-day workflow: PASS. Release acceptance: INCOMPLETE. KEEP GLOBAL DEFAULT OFF.**

The actual browser run for synthetic service date **2026-10-17** reconciles seven expected scheduled Records, seven completions, five exceptions and two additional rechecks. Plant's previous OperationalTemplate capture path still works and its completed Record satisfies a pinned Work Order requirement.

**October 16 update:** the hosted private Blob smoke now passes on a new isolated staging project, database, and private store. See [hosted acceptance](CANONICAL_RECORD_PHASE_8_2_HOSTED_ACCEPTANCE_2026-10-16.md). The original project's Preview still shares production credentials and was not used. The broad repository test run has unresolved baseline failures; a focused regression pass is not a whole-repository release pass.

Work remains local on `cursor/phase-82-acceptance-state`, based on `cf28c0c`. No deployment, production configuration change, database reset, evidence deletion, schema migration, commit or push was performed.

This report continues `CANONICAL_RECORD_PHASE_8_2_ACCEPTANCE_2026-10-15.md`. Its October 15 overlap findings and existing evidence remain valid and preserved.

## Test environment and clock limits

The acceptance server used an isolated Next development output directory and port 3002 with the existing local `ltc_manager` database. A temporary preload outside the repository simulated October 17 in America/New_York. It was guarded against nonlocal databases, Vercel and production execution. The normal application source contains no acceptance-clock hook.

Only this test process enabled canonical capability, local filesystem media, Dietary Asset Operations, Plant's existing runtime and Operational Assignments. No release status or global code default changed. Synthetic STAFF, SUPERVISOR, Plant STAFF and Plant MANAGER identities were used; credentials are intentionally omitted here. Existing identities were preserved. The temporary server and browser tab were closed after acceptance, and generated test-output additions to `tsconfig.json` were removed.

The simulated application clock does not replace PostgreSQL's wall clock. Database-default attachment/signature/update timestamps therefore show the real October 15/16 instant. Restarting the test process also rebased its simulated clock. These samples verify service-date authority, capture, persistence, permissions, projections and export contents; they do not certify cross-clock timestamp chronology. No historical timestamp was rewritten to hide that limitation.

## Actual staff capture

Dietary STAFF signed in through the facility PIN screen and submitted every clean-day scheduled fact through the browser. No submitted Record was substituted with a direct database insert.

| Capture | Scheduled Records | Exceptions | Additional rechecks |
|---|---:|---:|---:|
| Main Kitchen Walk-In Cooler, Morning and Afternoon, 38°F | 2 | 0 | 0 |
| 1A Servery Cooler, Morning and Afternoon, 55°F | 2 | 2 | 2 at 38°F |
| Opening Checklist v2 | 1 | 1 | 0 |
| Kitchen Sanitation Audit | 1 | 1 | 0 |
| Sanitizer Reading Log | 1 | 1 | 0 |
| Total | 7 | 5 | 2 |

Missing corrective actions were rejected by the real forms. The audit used Compliant, N/A, a critical Non-Compliant answer and a 38°F temperature. It saved a synthetic photo and a drawn signature. Its pinned grade is **60%, FAIL, one critical failure**; N/A contributes no possible points. Corrective action and signature do not turn the failure into a pass.

The sanitizer form was exercised with row addition and removal. Three saved readings at 08:00, 11:30 and 14:45 contain 200, 100 and 200 ppm. Saved detail and reports show average **166.7 ppm**, minimum **100 ppm** and count **3**. The low reading remains an exception.

## Supervisor, Log Book and Review

The actual SUPERVISOR session saw nine completed Log Book entries and followed a Log Book link to canonical detail. Both original 55°F failures retain their linked 38°F rechecks and original corrective action.

Create Issue was tested against both eligible clean-day cooler failures. The new Issues retain `originEvidenceRecordId`, asset and unit context. Successful submission opens the saved Issue; the originating failure remains unchanged. No Work Order is automatically created by that action. With Dietary Asset Operations disabled, the button is now hidden using the same authority as the write path.

Administrator Day Review shows five corrective actions and two ordinary scheduled completions. Its rows now identify the cooler and definition rather than saying “Unassigned location” or only “Morning.” Current asset labels are explicitly marked as current names.

Range Review for October 16–17 shows **7 of 7 expected evidence items completed**, five corrective actions, one inspection at 60%, one failed inspection and one critical failure. October 16 remains LEGACY and contributes zero canonical expected slots. Menu-history availability messages are separate from Record reconciliation.

The actual audit and range fact loaders independently confirmed these counts. October 15 still refuses the overlapping checklist lineage. The clean run did not edit either placement's historical dates or remove prior submissions.

## Downloaded packets and media

Actual PDF, Excel, slot CSV and response CSV downloads were inspected for all four definitions. ExcelJS opened the workbooks; native Excel was not used. PDF text was extracted and pages rendered and visually inspected. Downloaded files are in `tmp/phase82-clean-day/`.

| Definition | Expected | Completed | Exceptions | Response rows |
|---|---:|---:|---:|---:|
| Cooler Temperature Log | 4 | 4 | 2 | 4 |
| Opening Checklist v2 | 1 | 1 | 1 | 5 |
| Kitchen Sanitation Audit | 1 | 1 | 1 | 7 |
| Sanitizer Reading Log | 1 | 1 | 1 | 12: nine cells and three calculated results |
| Total | 7 | 7 | 5 | 28 |

Each slot CSV has one row per expected slot. Workbook N/A and exception booleans were checked. Checklist exports now retain all five answers, including the failed equipment check, notes and attestation; the initial incomplete packet is retained alongside `checklist-fixed.*` as defect evidence.

The authenticated application photo download matches the synthetic upload:

```text
SHA-256: 8cbf2b896796a2b75830a9c0f23bd841d039ee2b60cb49e6c8c8ea1428358155
```

The PDF visibly includes the photo and drawn signature with signer and saved time. This proves the explicit local development filesystem media path, not hosted Blob storage.

## Plant compatibility

A create-only local fixture supplied a published previous OperationalTemplate, synthetic Plant staff assignment and corrective Work Order. The Plant STAFF browser session opened its assigned location, started the previous checklist and submitted its two answers successfully while canonical capability remained enabled for Dietary.

The Plant MANAGER browser session linked that completed Record to the Work Order's pinned requirement. The UI showed **Satisfied** and associated completed evidence. Read-only persistence checks confirmed:

```text
Plant Record: c64d66f061e2161589b81cfa3
templateId: c4103183ce318df09e0eb7ef2
logAttachmentId: null
status: COMPLETED
Work Order: cmva9v2zk0009xw1ltpxot6ss
required template version: 1
requirement status: SATISFIED
Plant Record engine decisions: 0 (LEGACY default)
```

This is compatibility verification, not implementation or release of the Plant Product. The test Work Order remains in progress; only its evidence requirement was satisfied. No PM generation or full Work Order closeout is claimed.

## Additional defects fixed during the clean run

1. Asset-targeted canonical Records now capture the asset's facility-scoped unit context at submission. Attachment target identity remains ASSET; old facts are not backfilled. This restores existing Issue eligibility without relaxing scope checks.
2. Create Issue honors Asset Operations authority and opens the saved Issue after a canonical detail submission.
3. Formal checklist packets retain every saved scalar answer. The shared projection preserves false answers, pinned order, units and per-answer exception flags across PDF, Excel and response CSV.
4. Employee Runtime and its offline bundle choose canonical versus previous template evidence by facility, department and service date rather than the deployment-wide capability alone.
5. The shared previous-template submission action checks the requested department's existing evidence authority rather than requiring the Dietary feature flag for Plant.
6. Day Review identifies each asset and definition clearly, keeping current-name certainty explicit.

The earlier continuation's fixes for attachment history, preflight, report conflicts, rollout reconstruction, calculated detail, Log Book navigation, inspection grades and CSV/XLSX fields remain included.

## Data integrity

Dietary now has 18 canonical OperationalEvidenceRecords: 14 scheduled and four follow-ups across October 15 and 17. Its previous nine Records remain. There are four evidence attachments across the two audits and 18 repeating cells across the two sanitizer submissions.

The only new previous-template evidence is the separate Plant compatibility Record. The facility still has zero legacy `LogSubmission` and zero `InspectionSubmission` rows. No alternate canonical fact store was added.

## Hosted smoke blocker

Read-only Vercel metadata identified one existing private store, `ltc-manager-private`, attached to the application. No isolated test store was identified. The project environment entries are shared:

| Key | Targets on the same entry |
|---|---|
| DATABASE_URL | production, preview, development |
| DIRECT_URL | production, preview, development |
| BLOB_READ_WRITE_TOKEN | production, preview |

At this report's original completion, secret values were not decrypted or printed and no hosted test evidence was written. The October 16 continuation created separate resources and passed upload → metadata → authenticated retrieval → PDF retrieval, including anonymous denial. The original project's Preview was not used for synthetic submissions and cannot be treated as an isolated test environment. Details and proof are recorded in the hosted acceptance report.

## Verification

- Focused hermetic regression suite: **399 passed, zero failed**, covering canonical Logs, Record authority/history, audit, compliance packets, Review, occurrences, Employee Runtime, previous OperationalTemplates and offline helpers.
- Actual local browser and database/report-loader checks passed as described above.
- Actual downloaded packet assertions: seven expected, seven completed, five exceptions; all four workbook/CSV/PDF families checked.
- TypeScript: `tsc --noEmit --incremental false` **PASS** after temporary build-path cleanup.
- ESLint: all **44 touched TypeScript/TSX files** checked; zero errors, two existing protected-media `<img>` optimization warnings.
- `git diff --check`: **PASS**. No `tsconfig.json` change remains.
- Broad `test:hermetic` attempt earlier in this continuation: 3,500 tests, 3,307 passed, **53 failed**, 140 skipped. Failures include UI contract assertions, incomplete mocks and a database-dependent inspection test trying to use the network-restricted local database. An unchanged `cf28c0c` snapshot had 3,488 tests, 3,291 passed, **57 failed**, 140 skipped. All 53 remaining failing test identities occur in that baseline; there were zero new failing identities and four resolved ones. The baseline comparison used an unreachable local database target and did not touch the existing acceptance database. Later final-scope changes were checked with the 399-test focused suite. The broader baseline failures still need triage before a global release claim.
- Destructive/reset database suites were not enabled against the existing acceptance database.
- Production build: **PASS**, `next build --webpack`, using an isolated `.next-phase82-webpack` directory. Compilation, TypeScript and static page generation completed. Turbopack was blocked by local process-port restrictions, so its default build is not claimed as passing in this environment.

## Release recommendation and next step

**Keep the global default off and do not change production yet.** The isolated hosted resources and real private Blob smoke are complete as of October 16. Remaining release work is to triage the broad verification failures and prepare an explicit controlled capability release with a saved scoped rollout. Production Build → Logs will not reappear automatically in a later phase.

Proof screenshots include `range-summary.jpg`, `range-review.jpg`, `day-review-final.jpg`, `log-book.jpg`, `supervisor-issue.jpg`, `plant-legacy-completed.jpg` and `plant-required-evidence.jpg`. Corrected checklist packets use `checklist-fixed.pdf`, `checklist-fixed.xlsx`, `checklist-slots-fixed.csv` and `checklist-responses-fixed.csv`.
