# ONB-07 R07-01A — Approved checkpoint retirement

October 19, 2026. **R07-01A local gate PASS. ONB-07 remains incomplete / release HOLD.** User-approved D23 only; no new onboarding/offline features, migration, retry/concurrency override or live operation. [Verification inventory](./ONB_07_WORKBOOK_RETIREMENT_VERIFICATION_2026-10-19.json) records commands, owner/log fingerprints, failed attempts and reused/not-run evidence. Earlier [contention report](./ONB_07_WORKBOOK_CONTENTION_2026-10-19.md) and inventories remain historical.

## Causal finding and correction

The retained migration-150 failure was **domain-row execution during resumption**, after successful parent/child claims: 26 mappings, one People failure with empty targets, one unattempted membership. PostgreSQL/Prisma correlated five P2034 rollbacks with User insertion or atomic receipt append. The full workbook checkpoint kept rereading completed, unused People. Its actual 28-row probe held User heap-page predicates shared with other Facilities' Users. This establishes an unnecessary protected read set; it does not reconstruct every SSI edge or prove every past failure had that cause.

D23 approves retiring completed People only when no remaining row consumes them. A pure projection in `planning.ts` now drives both identity locks and catalog reads. Pending/failed/unknown/blocked consumers retain local references, literal Employee ID/email aliases and resolved canonical identities. Unresolved aliases remain conservative. Non-People inputs, complete Facility location/organization catalogs and live actor checks remain protected.

New signed reviews and existing parent JSON bind **internal checkpoint version 2** into immutable intent. Success/reuse updates mapping and projected checkpoint in the same Serializable transaction as domain effects and canonical child/parent receipts. Subsequent guards verify mapping against committed receipts. Older unversioned reviews/parents retain full protection; no historical migration or upgrade. Unsupported versions and parent/review mismatches reject even with no eligible work.

An external edit to a completed, unused person no longer invalidates unrelated remaining intent. A still-consumed person's facts remain protected. CSV behavior, canonical identity/membership writers, consent, credentials/lifecycle, current authority/licensing/publication rules, five bounded rollback attempts, 25 attempted rows per request and unknown-outcome reconciliation are unchanged. Twenty-five attempts are not twenty-five guaranteed commits. Results continue reporting actual partial outcomes.

Changed runtime owners: workbook `planning.ts` and `service.ts`. Meaningful additions are in the workbook hermetic/database tests. No shared CSV catalog/transaction owner, offline/timing writer, schema or migration changed in this follow-up.

## Final verification

Frozen production build **5S9jh0r0wyAcpcoCpYyXY**. Node 24.19.0 / PostgreSQL 14.18; isolated synthetic data, provider credentials blank, signup disabled/unmodified. Full logs under ignored `tmp/onb07-r07a-retirement`.

| Check | Actual result |
|---|---|
| Pure workbook contract/planner | **13 passed / 0 failed / 0 skipped**. CSV parity, dependency/alias projection, resource/security bounds retained. |
| Representative concurrent workbook/CSV/service group | **59 passed / 0 failed / 1 skipped**, 60 total, normal cross-file concurrency. |
| Required final integrated DB gate | **3,684 passed / 0 failed / 7 skipped**, 3,691 total; **150 migrations / seed twice / schema assertions PASS**, 446 files and 57 SQL-backed suites. Original 25-row resumption and partial-recovery assertions unchanged. |
| Customer/Console workbook browser | **8 passed / 0 failed / 0 skipped**, final build, desktop 1280px/tablet 768px. Real preview/confirm/results/reload, lost-response reconciliation, denied roles/Facility isolation, staff attribution and 25-row continuation. |
| Production build / lint | Build including TypeScript **PASS**; four changed source/test files **0 lint errors/warnings**. Intermediate standalone TypeScript also passed; not labelled a separate final run. |
| Migration integrity / discovery | Normal Git-aware **150 PASS**, unchanged historical checksum exception; discovery **446 / 57 PASS**. Four retained targets each have 150 applied/disk migrations, zero mismatch/pending/unfinished. |

Final read-only inspection found two 28-row integrated workbooks: each has **28 mappings, 28 parent success receipts, 28 distinct child IDs and 28 successful canonical child receipts**, 27 Facility Employees including the administrator and one shared physical Space. One case retains the deliberately exhausted claim attempt before recovery; its failed receipt never supplies a mapping. Historical failed parent `eeba6dce-632b-43a3-9675-5b529e2424ce` remains at 26 mappings and was never replayed to manufacture a pass.

The **intermediate** rolled-back diagnostic (before the additional literal-alias correction) on that historical source projects 28 inputs to the location, pending p26 and membership: **27→17 queries, 56→24 SIREAD locks, five→zero User heap predicates**. This is intermediate catalog evidence, not a fresh final-source probe, complete mutation-lock graph, benchmark or production performance claim. Final certification rests on the actual final database/browser gates.

## Retained failures and intermediate evidence

- The first new focused group was **2 passed / 1 failed**: signed version downgrade escaped validation when no row was eligible. Corrected parent-claim validation now rejects it; final group/integrated regressions pass.
- The first representative group was **57 passed / 1 failed / 1 skipped**. Partial recovery exhausted five User-creation attempts (backend 70199, XIDs 103595/103601/103606/103651/103720); four earlier mappings remained, no person/User effect or mapping was fabricated. The receipt snapshot and PostgreSQL/Prisma correlation remain. No completed People existed to retire in that case; do not attribute its later pass to alias retirement or claim all contention is eliminated.
- Review found that a pending literal alias must retain the full completed-person facts, not just the relationship's narrower projection. The intermediate integrated run was intentionally stopped before a complete result; log/database retained. The alias correction and a regression for full account drift precede the final candidate. No passing full gate is claimed for the interrupted candidate.
- Earlier migration-148/150 failures and rejected experiments remain in their original records. This final full checkpoint is a newly verified changed candidate, not a relabelling or unchanged rerun seeking a pass.

The previously observed Partner membership-end and PM replacement cases both **pass in this checkpoint**. Their owners were not changed, their earlier failures are retained, and no causal fix or baseline exception is claimed. Keep intermittent findings available for owner triage rather than describe them as erased.

## Preservation and remaining gates

All **2,610 initial index entries** and unrelated dirty files are preserved. Existing staged candidate/overlays remain; only the new report/inventory are added to normal tracking. Next's two temporary build-only tsconfig includes were removed after asserting no unrelated change; exact initial bytes restored. Final runtime/test fingerprints stayed frozen. Historical logs/screenshots remain; current artifacts use a run-specific directory.

SPACE offline/PIN and unchanged Dietary browser evidence is **reused**, with original build **eYn2LNGJB_kx6ATlH7XPy** and inventory. Comparing its 286-file manifest finds changes only in workbook/CSV owners; offline/timing/assignment/shared transaction/scanning/schema owners are unchanged. No unchanged offline/browser replay was run. Standalone whole-repository hermetic/static suites and remote CI are **not run** here; the integrated all-test DB mode is not a substitute for the standalone CI modes. Normal mandatory remote Node 20/PostgreSQL 16 jobs remain pending.

Production private Blob/ClamAV, TLS/secrets/signatures/scheduling/ownership, managed offline recovery keys and intended-target migration governance remain prerequisites. Actual pilot Facility/workflow/owners/window and customer acceptance remain pending and unauthorized. No commit, push, deployment, signup enablement, live charge, customer-data operation, external message or pilot activation. **This closes the local R07-01A finding; it does not complete ONB-07 or approve rollout.**
