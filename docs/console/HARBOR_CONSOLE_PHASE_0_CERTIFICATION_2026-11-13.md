# Harbor Console Phase 0 certification

**November 13, 2026 · PASS WITH GAPS · Ready for architecture review**

The two Phase 0 controls passed targeted authorization and regression checks. The remaining gaps are release verification with the approved private scanner, hosted review, and inspection of any previously misclassified Catalog lineages.

GitHub `ADTrauts/LTC-Manager` `main` matched the audited SHA `bc85549aaf4c099a0a8fc303a76ba82e4bb3328c` at implementation start and at the follow-up check before publication. The branch is `fix/harbor-console-phase-0`. The audit report was read from the earlier local audit checkout.

| Finding | Root cause | Remediation and preserved owners |
| --- | --- | --- |
| HC-01 · Implementation originals | The two download paths applied different authorization rules to shared attachments. | The Console handler and `src/lib/support/download.ts` use the established source and participant policy in `implementation/service.ts`. Support retains quarantine, scanning, private storage, integrity checks, and ordinary attachment downloads. |
| HC-20 · Private Records ownership | Catalog services applied ownership inconsistently across reads, writes, and successor creation. | `canonical-logs/catalog-service.ts` scopes mutations and preserves the source owner and operator period in successors. Console list and detail use platform scope. Records Build and related Knowledge and Plant pickers, installation, placement, and version services reuse the CDA Facility and vendor policy in `department-authority/catalog-forms.ts`. Facility ownership stays enforced with the CDA rollout flag off. Existing definitions, installations, placements, and published history remain in their canonical stores. |

Implementation commits:

- `53b682c0ebeec2bd33fd1da304d7ba3b1fd0483e` · Implementation attachment access.
- `ff0fde4a8f008b34dd2c64524bcfa4b9ba2acc2b` · Records ownership enforcement.

## Executed verification

| Check | Result |
| --- | --- |
| Node 24 TypeScript and production Webpack build | Pass. ESLint on changed Records files reported zero errors and one existing unused-parameter warning in Knowledge actions. Migration integrity and test discovery passed. |
| Repository hermetic suite | The full follow-up rerun passed 3,389, with zero failed and 320 skipped. The earlier focused rerun after final service edits passed 19/19. |
| Focused PostgreSQL suite | Fresh database rerun yielded 28 passed, zero failed, and one real-scanner case skipped. Checks covered ordinary Support access, authorized and unauthorized Implementation access, cross-Facility browse, detail and installation, Catalog publishing, and successor ownership. |
| Final PostgreSQL rechecks | Catalog and CDA selection passed 5/5. The vendor handover check passed again with authorized vendor creation/publication, former vendor denial, install, and flag-off assertions. The separate vendor-head and Facility-owned form regressions passed. |
| Published Catalog and placement history | Both the audit baseline and Phase 0 passed 3/3 on separately migrated databases. On two more fresh databases, seeding the Marketplace browser fixture's partial `cooler_temperature_log` row reproduced the same two missing-window failures on each revision. The published seed preserves an existing stable key and version, so the partial fixture stays in place. This is a baseline fixture collision. |
| Chromium Console and Implementation | Eight selected current Marketplace tests passed, including the new private form browse/detail case. All six Implementation tests passed. The older Marketplace cases expecting retired Work presets were outside this rerun. |

Tests used disposable PostgreSQL and synthetic records. Attachment authorization tests used the shared server reader with an in-memory store and a controlled CLEAN fixture. The real scanner and private Blob HTTP path, hosted Verify results, and historical ownership inventory remain open. Any correction to existing ownership requires a separately reviewed inventory. The draft review branch disables automatic Vercel deployments through a branch-specific `vercel.json` entry.

Codex recorded `{"detail":"Bad Request"}` as a turn-level error without an operation identifier. The recorded GitHub calls had completed successfully, and the local test runs recorded their own results.
