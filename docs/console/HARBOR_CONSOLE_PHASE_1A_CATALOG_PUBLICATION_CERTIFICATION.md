# Harbor Console Phase 1A Catalog publication certification

The first Phase 1A implementation applies the approved `catalog.publish` rule from [the staff authority architecture](HARBOR_CONSOLE_PHASE_1_STAFF_AUTHORITY_ARCHITECTURE.md), integrated at [`cf457081`](https://github.com/ADTrauts/LTC-Manager/commit/cf457081c422a8dac6daff35f76507069781ea8a).

## Enforcement and transaction

Harbor authentication verifies the signed staff session and checks the current `PlatformStaff` row for active status, email, role and session version. The typed `catalog.publish` policy permits OWNER. Both `publishHarborCatalogAction` and `saveAndPublishHarborCatalogAction` call the same server guard. MEMBER receives a denial before any draft edit. Missing or invalid Harbor authority follows the existing Console sign-in redirect. A Facility customer session does not supply Harbor authority.

The transaction rechecks the staff row under a share lock and locks the VSSYL Catalog definition before reading and publishing it. The existing Catalog service still owns validation, ownership and versioning. For combined Save and Publish, draft metadata, field replacement, publication and the existing `CATALOG_PUBLISH` audit event commit together. A rejected publication rolls back all draft edits. Cache revalidation follows the commit.

The draft editor uses the same policy after resolving staff on the server. MEMBER retains Marketplace browsing and draft creation and editing. Retirement, successor creation and draft deletion retain their existing authorization. Facility and vendor Catalog operations keep their Phase 0 scope and ownership rules. The implementation adds no identity model, permission engine, schema or migration.

| Files | Change |
| --- | --- |
| `src/lib/harbor-console/auth.ts` | Code-owned role policy and transaction-aware reuse of live staff validation. |
| Console Catalog `actions.ts` and `[stableKey]/page.tsx` | Both publication boundaries, the shared transaction and the editor's publication affordance. |
| `auth.hermetic.test.ts`, `catalog-publication.db.test.ts`, `scripts/verify/discover-tests.mjs` | Role policy, direct server actions with signed sessions and disposable PostgreSQL, and registration with Verify. |
| `tests/console-browser/marketplace-release.spec.ts` | Normal MEMBER and OWNER logins, persisted MEMBER draft edit and OWNER publication. Corrected the stale redirect expectation for the retired Work preset URL. |

## Verification

The focused SQL run passed eight tests with no skips. It exercised both publication actions directly with live OWNER and MEMBER identities, a live Facility Administrator session, missing and invalid sessions, and inactive, deleted, revoked and demoted staff. It checked whole-draft snapshots on denial and rollback, the existing audit event, both private ownership kinds, prior published versions and a Facility installation pinned to the prior version. It also exercised the existing Facility Catalog isolation and vendor handover SQL tests.

The full hermetic run passed 3,416 tests with 321 expected skips and no failures. Lint on the changed source and test files, test discovery and repository hygiene passed. An initial focused SQL invocation supplied the disposable URL to the test harness but omitted it for the app's shared Prisma client. The rerun used the same disposable target for both and passed the Plant and vendor regressions.

TypeScript and the production build passed under Node 20. The full disposable database gate applied two existing migrations, seeded twice and passed 3,758 tests with seven skips and no failures. The partner membership-end assignment race case passed. Its earlier failures remain a separate baseline issue. [Earlier architecture Verify run](https://github.com/ADTrauts/LTC-Manager/actions/runs/43656242066)

Five selected Marketplace scenarios passed in Chromium against the local production build. They covered the role-specific editor, private Catalog browse and detail, Record adoption display and customer access boundaries. The existing multi-route test initially timed out waiting for a login redirect from a retired Work preset URL. The timeout reproduced at the approved baseline. A route check confirmed that both revisions return 404 for that URL and redirect current Marketplace routes to staff sign-in. The browser test now checks each expected response.

## Remaining boundaries

Facility work sessions still require Phase 1B review and implementation. This capability does not confer Facility access or certify the current work-session adapter. Other Harbor operations, including retirement and successor creation, await separate policy classification. Production readiness and release approval remain separate from PR review.

## Merge and staged build

**Phase 1A PASS.** The product owner authorized merging reviewed head `279845c3acff628b8007fe157a10cb7f9cc7799a`. All ten required check results were green and the reviewed head was unchanged. PR #13 merged with a merge commit. GitHub and local `main` matched `23c6e6e9b895508ebfc3bf16e8631ec2838459f1`. [PR #13](https://github.com/ADTrauts/LTC-Manager/pull/13) · [PR Verify](https://github.com/ADTrauts/LTC-Manager/actions/runs/43667057569) · [Push Verify](https://github.com/ADTrauts/LTC-Manager/actions/runs/43667028990)

Vercel created a Ready staged build with a Production target for that exact merge. Its deployment URL and generated alias redirected anonymous traffic to Vercel Authentication. Vercel listed no custom public aliases on the candidate. Project-level Production database variable metadata matched the expected bindings. The build remains unpromoted. The role-specific smoke test used the local production build and synthetic data. Signed-in readiness and role testing against the staged Production candidate are still open for release review.

Phase 0's historical Catalog ownership inventory, approved scanner/private Blob verification, and production release approval remain separate enablement gates. Facility work-session controls move to the [Phase 1B proposal](HARBOR_CONSOLE_PHASE_1B_FACILITY_ASSISTANCE_ARCHITECTURE.md).
