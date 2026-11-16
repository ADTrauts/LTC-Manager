# Harbor Console Phase 1B.1 legacy work-session retirement

The product owner approved the temporary pause in legacy staff Facility workspace access. The reviewed [architecture PR #14](https://github.com/ADTrauts/LTC-Manager/pull/14) passed all ten required checks and merged at [`d1c50a05`](https://github.com/ADTrauts/LTC-Manager/commit/d1c50a05667272a0b1571687b9ca051a8c812564). This slice implements that pause. [Facility assistance architecture](HARBOR_CONSOLE_PHASE_1B_FACILITY_ASSISTANCE_ARCHITECTURE.md)

## Retired authority

The old Work entry endpoint returns 410 to signed-in staff and cannot mint a token. The legacy token issuer, proxy allowlist, application-session adapter, compatibility Facility Administrator projection, and workspace shell are removed. Harbor navigation explains the pause and links to cleanup for browsers with the retired cookie.

Protected customer routes reject the presence of the legacy cookie before interpreting customer credentials. The same boundary applies to application session and User identity reads used by direct handlers and Server Actions, as well as partner session exit. A work token, Harbor login token, or old projected staff session cannot become valid customer authority. Malformed and empty markers receive the same treatment as valid legacy tokens. Staff Console operations continue using their separate live Harbor authority.

Cleanup is an explicit same-origin POST available after staff sign-out. It expires the retired cookie without using its contents as destination or authority, and preserves any genuine customer cookie. The original customer, partner and Employee authorization readers handle subsequent requests in their own contexts. Harbor sign-out clears both Harbor cookies. It does not perform customer sign-out.

## Preserved workflows and legacy references

| Area | Evidence and disposition |
| --- | --- |
| Customer Facility authority | Both ordinary application session resolution and direct Builder actions retain their current role-period decisions. Legacy staff inputs and mixed cookies yield no session data or writes. |
| Department and partner authority | Genuine Employee and partner session fixtures use current Department and partner scope. The retirement gate removes only legacy staff admission and stale context fallback. |
| Harbor Catalog and Support | Console login and capabilities remain separate. Marketplace customer ownership, staff draft access and OWNER publication stay with Phase 0 and 1A services. Support continues to own attachments, scanning and custody. |
| Implementation and historical receipts | Engagement and original-file authority remain in the existing domain. The old token decoder can only identify a retired context for a denial. Clear the marker before continuing. Original staff actors can still share historical receipts through authorized Console engagement workflows. New customer imports use their real User authority. |
| Stored legacy actor markers | Existing audit events and staff-attributed setup receipt rows remain readable by authorized domain projections. Shared types, CDA branches and actor labels remain for compatibility and history. The customer session validator now rejects the legacy principal, and Bulk setup rejects it before database access. |

Some customer pages write during loading. Facility Builder can backfill room types and link spaces. Assets can initialize responsible Organizations, and People can invoke roster preparation. These customer behaviors remain in the customer workflow. A future assistance surface needs a separately certified, side-effect-free projection. The implementation introduces no grant, session, loader, feature bypass, schema change, or data migration.

## Verification and release

The focused direct-handler tests exercise a signed, unexpired legacy work token, invalid and empty markers, and live OWNER, MEMBER, customer Facility Administrator, Employee and partner sessions on disposable PostgreSQL. The negative assertions include no active-Department cookie, no Builder mutation, no customer identity fallback, and no staff role projection. The positive cases cover explicit cleanup, normal customer Builder writes, and the independent staff capability decision. Separate tests exercise import denial and historical receipt access.

The local full SQL gate passed 3,760 tests with seven skips after the historical receipt fixtures were corrected. A sequential run of the affected suites passed 109 cases with one skip. The local hermetic suite, TypeScript, and production build passed. The updated browser-origin guard passed its direct tests, including the case where Next reports an internal hostname.

Six Implementation and four Marketplace browser regression cases passed on the local production build. The retirement scenario initially exposed a browser API harness difference and a legitimate cleanup request that was rejected because Next used an internal hostname. The tests now issue requests through Chromium itself, and cleanup and Harbor logout verify the browser origin against the request Host. Harbor's sign-out form follows its own cookie-clearing redirect. Customer sign-out retains its separate notification and revocation behavior.

The corrected retirement scenario passed in Chromium for both OWNER and MEMBER. It covered separate staff sign-ins, start denial, stale-cookie denial with a genuine customer session present, explicit cleanup, customer Builder access after cleanup, old-cookie replay, and staff sign-out.

GitHub Verify and the protected Preview must be reviewed on the exact PR head. Functional Preview checks use approved synthetic accounts through normal sign-in. Local signed-cookie fixtures are for isolated tests only.

A pre-retirement build still admits the legacy context, so it is an unsafe rollback target once this boundary is released. Before promotion, verify that live and reachable previous aliases cannot serve the retired capability to customer traffic. Use a patched revision as the rollback floor. Preserve customer authority and historical receipts through rollback. Production release approval is separate from this draft.

## Next approval

Start Phase 1B.2 with the disabled grant and revocable-session kernel after this slice is certified and integrated. Decide grant approval and revocation authority, single-owner handling, expiry and renewal, consent, audit retention and access, and single-Facility session behavior before enabling grant issuance.
