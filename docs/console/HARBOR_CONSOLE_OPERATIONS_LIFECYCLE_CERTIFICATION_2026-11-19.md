# Harbor Operations and read-only lifecycle — verification evidence

Date: November 19, 2026. Scope: the owner-selected Phase 3–5 first-release batch, not certification of the entire Harbor roadmap or Production configuration.

Branch: `feat/harbor-operations-lifecycle-batch`. Dependency: unmerged PR #41 at `9d9988e3e72c5c4117a119194c5c379d1473fa07`, unchanged by this batch. The verified preflight `origin/main` was `38d10725f9af141fe4e5d2ecca69e8a503458a5d`, already an ancestor. Exact published head and hosted Verify results belong to the draft PR's current commit/checks; a local result does not imply hosted verification.

## Implemented boundary

- Nine Operations queues with full matching counts and 25-row pagination, using existing Support, delivery, scan, automation, billing, entitlement and VSSYL Catalog facts. Recorded failures remain history; pending delivery age is not an invented SLA or permission to resend.
- Read-only scan diagnostics with ten bounded attempts, redacted result codes, existing lease/backoff rules, and links into the authorized Support/source workflow. No original, filename, storage key, hash, lease token, provider error body or implicit participation is returned.
- Read-only customer lifecycle and contextual follow-through to existing Owner invitation recovery, Support, participating assigned Implementation work and billing reconciliation. Canonical Administrator seat and Department eligibility are reused. No customer workspace admission or new lifecycle commands.
- Existing live Harbor session/role/version/logout validation before projection and a fresh check before return. New projections run inside PostgreSQL read-only RepeatableRead transactions. Existing actions retain their own authorization; only navigation and affected-path invalidation were extended.
- No schema, migration, new Catalog, identity store, permission engine, attachment system or readiness score. Manual suspension/reactivation, bulk/full-customer export and offboarding/deletion remain deferred future scope, not blockers to the chosen read-only feature release.

## Actual local verification

Final supported runtime: Node 20.19.2. Disposable PostgreSQL: 14.18, loopback only, in a new isolated cluster. Browser: installed Playwright Chromium against the standard production build. All fixtures are synthetic. No hosted database or provider was used.

| Check | Actual result |
| --- | --- |
| TypeScript | PASS, `npm run typecheck`; standard production build's TypeScript check also passed. |
| Changed-file ESLint | PASS, no errors or warnings after removing an unused import in the touched provisioning action. |
| Standard production build | PASS, `npm run verify:build` under Node 20, normal webpack and font handling; no mock font responses, skipped typecheck or build weakening. |
| Test discovery | PASS, 543 discovered files; new SQL suite registered with the SQL-backed inventory. |
| Migration integrity / Prisma validate | PASS, nine unchanged migrations and schema validation. No schema or migration diff. |
| Full disposable database gate | PASS, `npm run verify:db`: migrate deploy, canonical seed twice, schema assertions, then 3,823 passed, zero failed, seven skipped, 3,830 total. |
| Hermetic gate under Node 20 | PASS: 3,424 passed, zero failed, 346 intentionally skipped SQL cases; 3,770 total, 128 suites. |
| Focused read projections | PASS: all nine queue predicates, pagination past 200, stable bounded pages, scan-state partition, ten-of-eleven attempt projection, private Record/content exclusion, canonical lifecycle facts, Owner-only recovery details, cross-Facility metadata separation and participating assignment scope. |
| Negative authority/read-only proofs | PASS: missing/customer/expired/inactive/stale or forged-role staff, retired work context, logout during assembly, another login surviving that logout, exact receipt deadline, unchanged customer rows and database rejection of an injected write in the projection transaction. |
| Scanner regressions | Four synthetic/in-memory SQL cases passed; six real-worker cases skipped. Existing three-attempt, lease, backoff, explicit rescan, stale result, integrity and storage-failure behavior retained. These cases also ran in the full database gate. |
| Connected Chromium journeys | Five isolated specs passed: new Operations/lifecycle flow, invitation acceptance/setup handoff, assisted setup, lost-response request recovery, and claim/My assigned work/retired-context cleanup. Each spec uses its own fresh database and normal login. |
| Expanded Operations Chromium follow-through | PASS: existing ticket and exact reply, automation rule, platform draft editor with Member/Owner publication controls, scan diagnostics/source participation, billing review and lifecycle continuation. |

The new browser runner is `npm run test:harbor-operations-browser`. It rejects non-loopback targets, creates only uniquely named disposable databases, reuses a production build, disables provider credentials, and cleans up each owned fixture database. It is included in the existing Offline browser Verify job; the required job set remains five jobs. The other required jobs are Static and hermetic, Database integration, Assignment browser gate and Dietary pilot gate. Their exact-head hosted results must be checked after push and recorded on the draft review, not inferred from this table.

## Failures diagnosed and resolved

1. The three new readers initially imported `server-only`, absent from this repository's Node SQL runtime. They now follow the existing server-reader convention and retain the same live server authorization and read-only database boundary. The successful production build and direct SQL tests cover both execution environments.
2. The first full SQL gate reported 200 alert applications where an existing historical-clock automation regression expected one. The new synthetic tickets had been created in 1901 to sort first. Fixture creation now uses the current clock while only the intended queue ordering timestamp remains old. The new projection suite and the affected automation suite passed together, followed by a fresh full database PASS. No automation policy or unrelated concurrency implementation changed.
3. The first normal browser login exposed uppercase synthetic staff emails created directly by the test fixture; normal Harbor login canonicalizes email to lowercase. The fixture now stores canonical lowercase addresses. All five normal-login journeys and the expanded Operations flow passed afterward. Application authentication was not loosened.
4. A direct scanner-only invocation initially lacked its required local signing secret. Rerunning with the normal local test prerequisites passed all four synthetic cases; no product change was made for this harness error.

An initial exploratory build used the host-default Node 26, outside repository engines, and was stopped. Final build, typecheck, full database, scanner and browser evidence above uses supported Node 20. No successful Node 26 build is claimed.

## Remaining evidence and approvals

The seven skipped full-gate tests require a real private scanner/intake integration: six real-worker tests and one real service-intake test. Synthetic/in-memory storage and provider-free browser tests do not establish real scanner, private Blob, delivery callback, Stripe or scheduler health. Existing provider integration and historical Catalog ownership inventory gates remain in their earlier certifications. No live downloads or assistance were enabled.

Hosted protected Preview authentication/readiness and signed-in application smoke are not claimed here. Local Chromium proves actual normal authentication in disposable environments; it is not hosted infrastructure evidence. No hosted test-account login, fixture, migration, permission, binding or shared configuration change was performed. Normal feature-branch CI/Preview builds are review artifacts, not Production promotion.

Real staff roster/work-domain/MFA/recovery-approver configuration, assistance pilot activation/grants, target-specific migration-ledger and receipt-protection review, staged Production readiness and release approval retain their separate gates. This batch adds no migration. Do not merge #41 or this batch, migrate a hosted target, enable deferred functionality, move public domains or promote Production without the appropriate explicit approval.

Verdict: **PASS for the selected local implementation and combined local gate; PASS WITH GAPS for production enablement** because the provider, hosted application and release evidence above is intentionally separate. Exact-head hosted Verify remains a publication/review requirement and is recorded on the draft PR; no hosted pass is inferred here. The selected scope remains read-only; future lifecycle command policy is not an implementation blocker to it. No merge or Production promotion is approved by this certificate.
