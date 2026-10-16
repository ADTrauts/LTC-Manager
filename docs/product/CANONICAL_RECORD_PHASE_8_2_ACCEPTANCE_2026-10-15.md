# Phase 8.2 acceptance continuation — October 15, 2026

> A later clean-day browser run completed the prospective October 17 reconciliation, supervisor Issue and Plant compatibility checks. See `CANONICAL_RECORD_PHASE_8_2_CLEAN_DAY_ACCEPTANCE_2026-10-15.md` for current results and remaining release blockers. The October 15 history findings below are preserved.

## Verdict

**FAIL — local acceptance is incomplete.** The implemented fixes pass verification, but the complete pilot service day cannot be certified from the current checklist placement history.

**NOT READY FOR PRODUCTION PILOT**

Work is local on `cursor/phase-82-acceptance-state`, based on `cf28c0c`. This continuation did not deploy, change production configuration, migrate a database, or delete submitted evidence.

## Production Build → Logs diagnosis

Production at `vssyl.com` contains the canonical implementation. Its deployment environment did not contain `CANONICAL_LOGS_ENABLED`, which defaults to false. That capability gate hides Build → Logs. Installing later feature phases does not automatically enable it. A controlled release must explicitly configure capability and verify the facility/department/service-date rollout decisions. Keep other departments on their existing authority.

## STAFF provisioning and actual browser coverage

The employee PIN controls already existed in Employees → employee management card → Set PIN / Reset PIN. No PIN feature was added. Separate synthetic local STAFF and SUPERVISOR fixtures were provisioned through the existing onboarding path; existing employee credentials were preserved. The STAFF fixture's PIN was seeded locally. Actual browser sign-in used the facility PIN screen and keypad. The supervisor and facility administrator used their respective account sign-in paths. No credentials are included here.

| Workflow | Browser opened in this continuation | Newly submitted in this continuation | Persistence verified |
|---|---|---|---|
| Cooler 38°F | Existing record and due/history surfaces | No; earlier partial-run facts retained | Yes; two scheduled normal readings |
| Cooler 55°F | Exception detail and history | No; earlier partial-run facts retained | Yes; two scheduled exceptions |
| Recheck 38°F | Supervisor opened linked follow-up | No; earlier partial-run facts retained | Yes; two follow-ups, original 55°F retained |
| Opening Checklist v2 | Existing completion visible in Run/history | No; earlier partial-run fact retained | Yes; historical expectation is ambiguous |
| Kitchen Sanitation Audit | STAFF form | Yes | Yes; canonical record, photo, signature and 60% FAIL |
| Sanitizer Reading Log | STAFF form | Yes | Yes; three stable rows and nine cells |

Actual interactions also included corrective-action validation on both new forms, audit answers including N/A, photo selection/upload, drawing a signature, adding/removing sanitizer rows, entering reading times, and reading the completed results. These were performed in the browser, not substituted with direct record inserts.

The audit and sanitizer templates were already published, installed and placed at handoff. Their published/install/placement state was verified. This continuation did not recreate or republish them and does not claim those authoring clicks.

## Pilot preflight

Initial displayed state: **pilot ready**, no displayed blockers. Warnings said the service date was already open, Plant should retain previous templates, and repeating readings require an online connection.

Corrected displayed state: **not pilot ready**, with a Log setup error. The preflight previously considered active rows alone and missed the closed checklist segment that still covered the same day. It now checks overlapping effective-date lineages, including closed segments. The warnings remain.

## Tablet and supervisor

The STAFF forms, row controls, corrective action and signature were exercised at a 1024×768 viewport. The temporary viewport override was reset afterward. Browser automation occasionally needed native date/time input or keyboard activation; those tool issues are not classified as product defects.

The actual SUPERVISOR session opened Logs and Log Book, saw nine records, and opened a 55°F original with its linked 38°F follow-up. A Log Book redirect defect was fixed: canonical details no longer depend solely on the older Dietary evidence flag. Canonical Log Book links now open the detailed record view.

Create Issue was not exercised: these cooler facts lack the unit context required by the existing eligibility rule. No scope was invented and no rule was relaxed to manufacture eligibility.

## Manager Review and downloads

The facility administrator opened Day Review for October 15 and Range Review for October 1–15. The range now retains the inspection score from the submission snapshot: **60%, FAIL, one critical failure**. N/A is excluded from possible points. Corrective action and the signature do not change the failed grade.

Reports were downloaded for cooler, audit and sanitizer definitions. PDF content was extracted and rendered for inspection. Workbook archives were opened with ExcelJS; the audit summary was also rendered using the spreadsheet artifact library. Native Microsoft Excel was not used. Both CSV modes were inspected.

| Definition | Review record audit | PDF | XLSX | CSV slots |
|---|---|---|---|---|
| Cooler Temperature Log | 4 completed, 2 exceptions; 2 linked rechecks | Expected 4, completed 4, exceptions 2; rechecks separate | Same counts; 4 record rows | 4 slot rows |
| Kitchen Sanitation Audit | 1 completed with corrective action; 60% FAIL | Expected 1, completed 1, exceptions 1; 60% FAIL, critical 1 | Same counts/score; N/A and exception booleans verified | 1 slot row |
| Sanitizer Reading Log | 1 completed with corrective action | Expected 1, completed 1, exceptions 1; all readings/calculations | Same counts; 9 reading cells + 3 calculated results | 1 slot row |
| Opening Checklist | Unavailable expectation | Export blocked | Export blocked | Export blocked |

Response CSVs preserve four cooler readings, seven audit response rows, and nine sanitizer cells plus three calculated results. Slot CSV now emits one row per expected slot, rather than repeating inspection slots for every question.

The sanitizer has readings at 08:00, 11:30 and 14:45 with values 200, 100 and 200 ppm. Its saved snapshot derives average **166.7 ppm**, minimum **100 ppm**, and count **3**. The 100 ppm cell remains an exception.

The cooler packets now identify both coolers. Names without a historical snapshot are explicitly marked as current asset names rather than represented as known historical names.

## Service-day reconciliation blocker

The old checklist v1 placement `c4d666364a6d0adc88ae8f90f` covers October 15 through October 15, inclusively. The active v2 replacement `c4d41993477552fc35eb71e5c` also starts October 15. They are the same Catalog/target lineage.

Run has seven completed scheduled facts, five exceptions and two follow-ups. Review can reliably reconstruct six completed scheduled slots and four exceptions; it flags the checklist expectation as unavailable. Overdue and missed counts are zero for the reliable slots. These totals are not a full-day pass. Choosing a version silently or deleting the prior placement would conceal the problem.

Placement updates now reject moving a future successor into an occupied date and reject changing an already-effective start date. Formal reporting refuses the ambiguous checklist day and returns a clear conflict instead of selecting a winner. Existing evidence and date history were retained.

## Data integrity

Local Dietary pilot totals after continuation:

```text
OperationalEvidenceRecord:
  scheduled: 7
  follow-up: 2
  canonical: 9
  newly submitted in this continuation: 2
LogSubmission: 0
InspectionSubmission: 0
OperationalTemplate pilot evidence: 0
OperationalEvidenceAttachment: 2 (photo and signature)
Repeating cells: 9
```

The initial seven records were preserved. No new legacy evidence was written.

## Plant compatibility

Plant has no rollout decision and remains LEGACY. Actual browser navigation showed one previous Logs link, its template library and its submission screen. It was not redirected to canonical capture. The local fixture has no Plant assignments, OperationalTemplates or published maintenance plans, so a Plant PM/WO evidence submission could not be exercised against existing work. No Plant configuration or rollout was changed.

## Rollback and reactivation

Both additional decisions were saved through the Record engine UI, not inserted directly:

| Dietary effective service date | Saved authority | Read-only verification |
|---|---|---|
| Before 2026-10-15 | LEGACY default | No canonical expected slots |
| 2026-10-15 | CANONICAL | Original records retained; checklist ambiguity reported |
| 2026-10-16 | LEGACY | No canonical expected slots |
| 2026-10-17 | CANONICAL | Seven expected slots; no submitted facts yet |

The actual range-review fact loader also excludes canonical expectation segments on legacy dates and retains the audit grade on October 15. Historical reconstruction uses saved rollout authority, so a current deployment capability switch does not rewrite earlier dates.

## Media

The explicit local development filesystem store was exercised through browser upload, authenticated retrieval and PDF embedding. The retrieved photo's SHA-256 matches the uploaded synthetic image. The saved signature appears in record detail and the PDF with signer and time.

Private Blob deployment smoke:

```text
put: NOT RUN
authenticated get: NOT RUN
PDF get: NOT RUN
environment: no isolated production-like non-production store was verified
```

Preview metadata contains a Blob token key targeting both production and preview. Only key metadata was inspected. This does not establish an isolated private test store or prove put/get behavior. The smoke test remains deferred until local acceptance passes and the non-production target is verified.

## Acceptance defects fixed

1. Completed sanitizer details omitted calculated results and did not consistently order repeating cells by saved row identity.
2. Completion messaging could summarize an inspection using its first answer rather than its derived outcome.
3. Log Book canonical record links redirected a supervisor to Schedule under the older evidence gate.
4. Range Review discarded pinned inspection grade data that Day Review retained.
5. Legacy departments could show both previous Logs and canonical Logs navigation under a deployment-wide capability gate.
6. Placement date edits could create overlapping successor history or rewrite an effective start date.
7. Preflight could report pilot ready despite overlapping checklist placement history.
8. Formal exports selected a version for ambiguous placement history instead of refusing the unsupported expectation.
9. Historical Review/report expectations were not limited by the department's saved rollout dates.
10. Excel response rows omitted the N/A and out-of-standard boolean fields.
11. Formal slot CSV repeated one inspection slot for each question.
12. Asset report rows lacked recognizable cooler names.

Four stale regression fixtures/assertions were updated for existing media, scoped rollout authority and the current Marketplace component. No production access check was weakened.

## Verification

- Manual browser acceptance: actual STAFF PIN, SUPERVISOR, administrator, tablet, media, Review, downloads, Plant navigation, rollback/reactivation.
- Hermetic regression suite: **292 passed, zero failed**, including Phase 8 rollout, Phase 7 structure, Phase 6.1 occurrence, reporting, canonical evidence, attachment history and Review.
- Read-only local integration checks: persisted evidence, legacy-write counts, actual audit loader, actual range-review loader, effective dates and export contents.
- TypeScript: `tsc --noEmit --incremental false` passed.
- ESLint: all 30 touched TypeScript/TSX files passed with zero errors; two existing `<img>` optimization warnings remain in record detail.
- `git diff --check` passed.
- Destructive/reset database suites were not run against the existing acceptance database.
- The global flag default remains false in code and `.env.example`.

## Remaining gaps

1. Complete a clean service-day reconciliation after the checklist overlap. The current October 15 history cannot be certified.
2. Repeat the older cooler/checklist capture paths with the actual STAFF PIN session on that clean day; this continuation verified their existing facts rather than claiming new capture clicks. Exercise Create Issue when an eligible asset/unit context is available.
3. Exercise a Plant legacy maintenance record against suitable local PM/WO fixtures.
4. Complete private Blob put → metadata → authenticated get → PDF get in a verified non-production deployment/store.

## Global cutover recommendation

**KEEP GLOBAL DEFAULT OFF**

## Next action

Finish a clean checklist service-day acceptance run without rewriting the submitted October 15 evidence. The saved October 17 canonical boundary has seven unambiguous expected slots and provides a prospective configuration for that run.

## Local proof files

Screenshots and actual downloaded reports are in `tmp/phase82-acceptance/`. Use `audit-fixed.xlsx` and `audit-slots-fixed.csv` for the corrected audit exports. The earlier copies are retained as defect evidence. The final cooler and sanitizer reports use their ordinary filenames. The main screenshots are `audit-record-final.jpg`, `sanitizer-result-calculations.jpg`, `manager-range-final.jpg`, `cooler-audit-final.jpg`, `checklist-history-blocker.jpg`, `rollout-history.jpg`, `supervisor-cooler-lineage.jpg` and `plant-legacy-submit.jpg`.
