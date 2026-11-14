# Harbor Console Phase 0 certification

**November 13, 2026 · PASS WITH GAPS · NOT READY TO MERGE OR DEPLOY**

The two Phase 0 controls passed targeted authorization and regression checks. PR #11 remains a draft. The architecture review accepted the approach and requested closure of the verification gaps before promotion.

GitHub `ADTrauts/LTC-Manager` `main` matched the audited SHA `bc85549aaf4c099a0a8fc303a76ba82e4bb3328c` at implementation start and at the follow-up check before publication. The branch is `fix/harbor-console-phase-0`. The audit report was read from the earlier local audit checkout.

| Finding | Root cause | Remediation and preserved owners |
| --- | --- | --- |
| HC-01 · Implementation originals | The two download paths applied different authorization rules to shared attachments. | The Console handler and `src/lib/support/download.ts` use the established source and participant policy in `implementation/service.ts`. Support retains quarantine, scanning, private storage, integrity checks, and ordinary attachment downloads. |
| HC-20 · Private Records ownership | Catalog services applied ownership inconsistently across reads, writes, and successor creation. | `canonical-logs/catalog-service.ts` scopes mutations and preserves the source owner and operator period in successors. Console list and detail use platform scope. Records Build and related Knowledge and Plant pickers, installation, placement, and version services reuse the CDA Facility and vendor policy in `department-authority/catalog-forms.ts`. Facility ownership stays enforced with the CDA rollout flag off. Existing definitions, installations, placements, and published history remain in their canonical stores. |

Implementation commits:

- `53b682c0ebeec2bd33fd1da304d7ba3b1fd0483e` · Implementation attachment access.
- `ff0fde4a8f008b34dd2c64524bcfa4b9ba2acc2b` · Records ownership enforcement.

Phase 0 uses the existing Catalog, Support attachment store and scanner, Implementation participant checks, and CDA ownership rules. The final review recovered a clean branch that matched GitHub. The inventory SQL was already committed in `8843fc8b` and matched the local copy byte for byte.

## Executed verification

| Check | Result |
| --- | --- |
| Node 24 TypeScript and production Webpack build | Pass. ESLint on changed Records files reported zero errors and one existing unused-parameter warning in Knowledge actions. Migration integrity and test discovery passed. |
| Repository hermetic suite | The full follow-up rerun passed 3,389, with zero failed and 320 skipped. The earlier focused rerun after final service edits passed 19/19. |
| Focused PostgreSQL suite | Fresh database rerun yielded 28 passed, zero failed, and one real-scanner case skipped. Checks covered ordinary Support access, authorized and unauthorized Implementation access, cross-Facility browse, detail and installation, Catalog publishing, and successor ownership. |
| Final PostgreSQL rechecks | Catalog and CDA selection passed 5/5. The vendor handover check passed again with authorized vendor creation/publication, former vendor denial, install, and flag-off assertions. The separate vendor-head and Facility-owned form regressions passed. |
| Published Catalog and placement history | Both the audit baseline and Phase 0 passed 3/3 on separately migrated databases. On two more fresh databases, seeding the Marketplace browser fixture's partial `cooler_temperature_log` row reproduced the same two missing-window failures on each revision. The published seed preserves an existing stable key and version, so the partial fixture stays in place. This is a baseline fixture collision. |
| Chromium Console and Implementation | Eight selected current Marketplace tests passed, including the new private form browse/detail case. All six Implementation tests passed. The older Marketplace cases expecting retired Work presets were outside this rerun. |

Initial verification used disposable PostgreSQL and synthetic records. Attachment authorization tests used the shared server reader with an in-memory store and a controlled CLEAN fixture.

## Certification closure

### Hosted Verify and TypeScript

[Verify run 43522525590](https://github.com/ADTrauts/LTC-Manager/actions/runs/43522525590) failed at Typecheck after the hermetic tests passed. V8 reported a 2,081.9 MB heap near the limit and terminated with exit 134 without reporting a compiler diagnostic. The four other jobs passed. The package policy permits Node 20.x or 24.x. The existing Verify workflow uses Node 20, and the correction keeps it there.

Commit `56acb369e1bdb4d520f53976318036fbdc5d3ad6` sets `NODE_OPTIONS=--max-old-space-size=4096` on the Typecheck step only. The command and compiler inputs are unchanged. Hosted Typecheck runs before the build and a clean checkout contains no generated Next types. On Node 20.19.2 with a 4 GiB old-space limit, the local clean check used 3,409,535 KiB as reported by TypeScript. With prior Next output present, it used 3,529,113 KiB. Both completed with no compiler diagnostics. The clean checkout alone exceeded the old hosted heap budget.

[Verify run 43549100982](https://github.com/ADTrauts/LTC-Manager/actions/runs/43549100982) tested the first correction. Its first attempt passed Static and hermetic (including Typecheck, Lint, Prisma validate, and Production build), Offline browser gate, Assignment browser gate, and Dietary pilot gate. Database integration failed two cases in unchanged suites, workbook rollback recovery and the partner membership-end assignment race. Both cases passed in isolation on separate databases for the audited baseline and the Phase 0 head. Database integration passed on the second hosted attempt, leaving all five jobs green on that revision. The first-attempt failure cause remains unconfirmed.

[Verify run 43550435735](https://github.com/ADTrauts/LTC-Manager/actions/runs/43550435735) confirmed that Next's TypeScript subprocess can reach the same default heap limit. The Offline and Assignment browser jobs both built the code successfully and then exhausted approximately 2 GB of V8 heap during the build's TypeScript phase. The follow-up sets the same 4 GiB limit on the production build and all three browser steps that invoke that build. Database, discovery, lint, and the standalone hermetic step retain their existing resource settings. See [PR #11 checks](https://github.com/ADTrauts/LTC-Manager/pull/11/checks) for the exact current head.

[Verify run 43550859282](https://github.com/ADTrauts/LTC-Manager/actions/runs/43550859282) completed successfully on its first attempt. GitHub reports PR head `3ef3a830d4aafa9986057f280ec11ba0608ecfde` for the run and for each of its five jobs.

| Required job | GitHub conclusion |
| --- | --- |
| Static and hermetic | Success |
| Database integration | Success |
| Offline browser gate | Success |
| Assignment browser gate | Success |
| Dietary pilot gate | Success |

The final release review updates this report only. The protected Preview and required Verify checks apply to the eventual merge candidate.

### Closure regression results

| Check | Result |
| --- | --- |
| Hermetic, Node 20.19.2 | 3,415 passed, 0 failed, 320 skipped. |
| Focused PostgreSQL, fresh migrated database | 35 passed, 0 failed, 7 skipped. The skipped cases require the real scanner. The run included private and ordinary attachment authorization, harmless synthetic scan and integrity fixtures, cross-Facility access, Facility/vendor publication and installation, successor ownership, vendor handover, and all three placement-history cases. |
| Production Webpack build, Node 24.19.0 | Passed. |
| Chromium, isolated synthetic database | Marketplace 8/8. Implementation 6/6. The selected Marketplace set excludes retired Work expectations. |

The Marketplace fixture collision remains a nonblocking baseline issue. Reproduce it by inserting the partial `cooler_temperature_log` version 1 row from `marketplace-phase-6c.spec.ts` into a fresh migrated database before running `phase-3-canonical-logs.test.ts`. The idempotent Catalog seed preserves the existing partial row. Two daily-window tests then fail on both revisions. Future fixture work can use a separate key or seed the full canonical definition.

### Historical Catalog ownership inventory

Before Phase 0, Facility and vendor creation wrote a default platform draft and then stamped its owner in a second write. A failure between writes could leave no private ownership metadata. The historical CDA owner migration defaulted preexisting definitions to VSSYL. The period backfill used an existing vendor owner, and the canonical baseline retains the ownership columns. The Harbor Catalog audit stores the action, actor, and timestamp without a Catalog definition ID.

The [inventory SQL](harbor-phase-0-catalog-inventory.sql) queries a repeatable-read, read-only transaction and returns counts by owner kind, status, and finding. Its final projection omits record IDs, keys, names, and owner identifiers. Direct owner-field conflicts and mixed platform/private lineages flag potential inconsistencies. Platform rows with no conflicting fields still require provenance, and structurally consistent private rows still rely on the accuracy of their recorded owner.

- **Synthetic verification.** The initial disposable fixture database had 21 platform versions requiring provenance and five structurally consistent private versions. The committed query reran successfully and identified all four deliberately added synthetic cases: a platform owner conflict, a mixed lineage, a private owner conflict, and a platform-default draft needing provenance.
- **Verified historical customer data.** No historical customer dataset was examined and no historical misclassification was confirmed.
- **Unverified historical data.** The target Catalog's historical ownership remains unverified. No authorized production-grade snapshot was available for this review. An aggregate result with no structural flags would still leave apparently platform-owned drafts that lack provenance.

1. Identify the authorized canonical database snapshot or read replica and record its capture time, schema and migration ledger. Use a SELECT-only role and run `psql -X -f docs/console/harbor-phase-0-catalog-inventory.sql` with the approved connection supplied outside shell history. The script uses a read-only transaction and returns grouped counts.
2. In a restricted review session, rerun the same CTE with its aggregate SELECT replaced by a projection of IDs, stable keys, versions, owner tuple, timestamps and status for `platform_owner_conflict`, `mixed_platform_private_lineage`, `platform_owner_needs_provenance`, and `private_owner_conflict`. Review published and draft versions. Compare exact trusted seed provenance, authoritative authoring receipts or historical backups that tie the specific definition ID or lineage to the owner, and the operator-period relationship.
3. Treat uses by a Facility as corroboration only. A platform definition can be installed or placed at one Facility, and the count, name, form shape, or timing alone cannot establish ownership. Classify unresolved platform versions as unknown. Record only aggregate results publicly. If evidence confirms misclassification, prepare a separately reviewed ownership correction with lineage, dependency and history checks.

### Private file integration

Support stores originals through the existing private Blob adapter and initializes accepted files in quarantine. The scan processor binds results to the attempt, hash, and length. Downloads require CLEAN and verify the stored bytes again before returning them. Implementation also checks the receipt, engagement and live staff participation through its existing service. The focused SQL checks exercised both download readers with memory storage, including legitimate Support, authorized participants, denial for unrelated staff and cross-engagement reads, changed bytes, failed scans, and retry behavior.

A separate test with the scanner and Blob credentials absent confirmed zero scan claims, unchanged PENDING state, and no readable bytes. Both authenticated HTTP download handlers returned 503 for a synthetic historical CLEAN row under that configuration. The final review reran ten focused Support and scanner-configuration tests successfully. Missing or unreadable private storage prevents a download, including for a CLEAN row. A configured scanner that becomes unreachable cannot produce a new CLEAN verdict. The download handlers check configuration, while an existing CLEAN row relies on its prior scan and the current private-object integrity check.

The live scanner and private Blob integration remains unverified. Before enabling live downloads, upload a synthetic file in an approved protected nonproduction environment. Verify quarantine before scan, successful CLEAN downloads for the permitted participant through both routes, denials for unrelated staff and other Facilities, checksum mismatch denial, and an ordinary Support download. Verify private storage access and the expected behavior during scanner and Blob outages. No real customer files were accessed.

### Release disposition

- **Merge blockers.** Obtain release-owner authorization to remove the `git.deploymentEnabled["fix/harbor-console-phase-0"]` entry and push a commit that can trigger a Preview. Before that push, verify Vercel Authentication and the canonical staging database binding under the existing Preview policy. Review the protected Preview and required Verify checks on the resulting candidate, then obtain merge approval through the existing review process.
- **Production enablement blockers.** Obtain approval to read an identified canonical snapshot or read replica with a SELECT-only role. Complete the inventory and disposition any confirmed historical misclassification before exposing Catalog data under the new controls. Obtain approval for the protected nonproduction scanner and Blob target and complete the synthetic integration test before enabling live original downloads. Production promotion requires separate release approval under the existing release policy.
- **Nonblocking follow-ups.** Track the Marketplace and placement-history fixture collision separately. Investigate the workbook and membership-end tests if the hosted failures recur.

The branch-specific `vercel.json` entry stays on the draft branch pending approval. Removing it restores Vercel's default automatic branch deployments and can queue a Preview. The exception must be removed before merge. No project settings changed. No deployment or merge was initiated.
