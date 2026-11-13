# Harbor Console Phase 0 certification

**November 13, 2026 · PASS WITH GAPS · Local verification complete**

The two Phase 0 controls passed targeted authorization and regression checks. The remaining gaps are release verification with the approved private scanner, hosted review, and inspection of any previously misclassified Catalog lineages.

GitHub `ADTrauts/LTC-Manager` `main` matched the audited SHA `bc85549aaf4c099a0a8fc303a76ba82e4bb3328c` when implementation began. The branch is `fix/harbor-console-phase-0`. The audit report was read from the earlier local audit checkout.

| Finding | Root cause | Remediation and preserved owners |
| --- | --- | --- |
| HC-01 · Implementation originals | Support and Implementation share attachment custody, but their download paths applied different access checks. | `src/lib/support/download.ts` and the general Console handler identify protected intake through existing message, ticket, and receipt records. Both download entry points use `implementation/service.ts` for current staff authority, engagement participation, work-session exclusion, receipt and checksum checks. A marked source with no valid engagement or receipt fails closed. Support still owns quarantine, scan status, private storage, byte integrity, and ordinary attachment downloads. |
| HC-20 · Private Records ownership | Shared Catalog readers and mutation services lacked consistent owner filters. Some private drafts were initially created under the platform default. Successors did not explicitly copy the source owner. | `canonical-logs/catalog-service.ts` scopes writes and stamps ownership at creation. Successors carry the source owner and operator period. Console list and detail readers use platform scope. Records Build and related Knowledge and Plant pickers reuse `department-authority/catalog-forms.ts` for Facility and vendor scope. Install, placement and version services apply that policy before writing, including when the CDA rollout flag is off for Facility ownership. Existing Catalog definitions, installations, placements and published history remain in the canonical stores. |

Implementation commits:

- `53b682c0ebeec2bd33fd1da304d7ba3b1fd0483e` · Implementation attachment access.
- `ff0fde4a8f008b34dd2c64524bcfa4b9ba2acc2b` · Records ownership enforcement.

## Executed verification

| Check | Result |
| --- | --- |
| Node 24 TypeScript and production Webpack build | Pass. ESLint on changed Records files reported zero errors and one existing unused-parameter warning in Knowledge actions. Migration integrity and test discovery passed. |
| Repository hermetic suite | 3,389 passed, zero failed, 320 skipped. Focused rerun of affected hermetic suites after final service edits passed 19/19. |
| Focused PostgreSQL suite | 28 passed, zero failed, one real-scanner case skipped. Positive and negative checks covered ordinary versus Implementation files, unrelated staff, a customer participant, work-session exclusion, mismatched engagement, participation removal, and valid participant access. Catalog checks covered foreign Facility browse, detail, installation and Console mutations, authorized local use and successor ownership. |
| Final PostgreSQL rechecks | Catalog and CDA selection passed 5/5. The vendor handover check passed again with authorized vendor creation/publication, former vendor denial, install, and flag-off assertions. The separate vendor-head and Facility-owned form regressions passed. |
| Published Catalog and placement history | 3/3 passed on a fresh migrated database. Two cases had the same missing-window failure on both the implementation and audit branches when run after shared browser fixtures. The clean run passed publication immutability, successor creation, placement version history, and evidence preservation. |
| Chromium Console and Implementation | Eight selected current Marketplace tests passed, including the new private form browse/detail case. All six Implementation tests passed. The older Marketplace cases expecting retired Work presets were outside this rerun. |

Tests used disposable PostgreSQL and synthetic records. The attachment authorization tests exercised the shared server reader with an in-memory store and a controlled CLEAN fixture. The HTTP path with a real scanner and private Blob configuration, hosted CI/Preview, and a production data inventory remain unverified. The patch preserves persisted ownership and history, so rows already classified incorrectly require a separate reviewed inventory and disposition before any data correction.

The review bundle is local because the GitHub repository is public and a branch push can trigger a hosted Preview. No branch was published, and no deployment or merge was initiated.
