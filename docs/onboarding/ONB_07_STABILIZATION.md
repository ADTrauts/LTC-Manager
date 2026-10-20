# ONB-07 repository gate stabilization

**Current follow-up:** [R07-01A/R07-01B report](./ONB_07_FOLLOWUP_2026-10-19.md) and [inventory](./ONB_07_FOLLOWUP_VERIFICATION_2026-10-19.json). Latest SQL: 3,657 passed / 1 failed / 7 skipped; offline 4/3 and Dietary 4/1 passed/failed at actual canonical SPACE Save returning 404. Eight program migrations / 148 total. HOLD; no pilot completion. The report below retains the earlier stabilization findings/options as historical evidence.


Scope: release-gate stabilization only. The original staged 213-file candidate is preserved in `tmp/onb07-stabilization/initial-staged.patch` with hashes/status in `initial-candidate.json`. Prior certification/inventory/blockers have separate snapshots. No commit, push, deployment, signup enablement or live operations are authorized.

## Root-cause groups before fixes

These are investigation groups, not baseline waivers. Exact original failure identities remain in the October 18 verification inventory; historical counts are not current passes.

| Group | Initial evidence | Classification / required investigation |
|---|---|---|
| L1 | Four React state-in-effect errors | UI state ownership; drawer arming, refreshed notifications, session draft restore/save, missing verification token. Preserve behavior; inspect lifecycle defects. |
| L2 | Four `require` errors in cycle test | Test module syntax; use normal ESM imports. |
| H1 | Location/Builder/SubNav/Board/source-copy assertions | Potential obsolete assertions; compare current owners and canonical contracts before changing expectations. |
| H2 | Customer Facility projections exclude Plant | Assertions predate Plant AVAILABLE; retain DEVELOPMENT EVS exclusion and internal provenance. |
| H3 | Projection profile/Experience goldens return empty | Unresolved actual projection behavior versus compatibility contract; reproduce before deciding. Never restore retired Runtime stores. |
| H4 | Organization claim mock cannot acquire required lock; partner and inspection mocks miss delegates | Incomplete fixtures and possible dependency injection leaks. Preserve mandatory locking and scoped Record-engine fences. |
| H5 | SQL concurrency cases execute in hermetic mode | Environment isolation/suite opt-in defect: ordinary DATABASE_URL can be populated from Prisma environment loading. Require guarded explicit verification opt-in. |
| H6 | Next trace exclusion assertion fails | Missing configuration or obsolete expectation; inspect supported Next configuration and actual traces. |
| D1 | Seeded Dietary/responsibility not found; global Catalog counts/drafts | Shared-data fixture selection/contamination suspected; scoped reproductions needed. |
| D2 | Canonical engine rollout, CSV column drift, DEVELOPMENT Product denial | Fixtures may predate current contracts; preserve current eligibility and typed inputs. |
| D3 | Offline outcomes, session grants, support/transaction errors, Plant/record cases | Unclassified until focused SQL reproduction; do not assume fixture-only. |
| B1 | Assignment/Dietary Plan-prefix and retired UI selectors | Compare current published Work Plan/Run owners, flags and browser traces. Keep real creation/confirmation/denial coverage. |
| B2 | Offline Unit Workspace never appears | Current space-first Run/configuration or actual offline defect; retain offline queue, exactly-once recovery and sign-out isolation coverage. |

## Evidence

Full logs are under ignored `tmp/onb07-stabilization/`. Failed reproductions remain retained. Final certification and gate verdict will identify run/reused/not-run evidence and remote CI separately.

## Resolution and review slices

The initial table above records investigation hypotheses. The following are findings from actual reproductions, not assumptions about baseline safety.

| Root cause | Classification and implemented resolution |
|---|---|
| Eight source lint errors | ESM imports corrected; Drawer arming is a ref; verification-token state is keyed; notifications reconcile new server snapshots; support drafts use a subscribed ticket-scoped session store, avoiding competing restore/save effects. No lint suppression. |
| Copy/route/projection assertions | Obsolete fixtures updated against current Locations, Build navigation, accessible SubNav, publication/assignment ownership and AVAILABLE Plant. DEVELOPMENT EVS stays denied. |
| Empty multi-area projection | Actual product defect: duplicate order 100 invalidated otherwise valid projections. Use profile area names/order and deterministic fallback. Golden outcomes pass. |
| Inspection global database reads | Actual dependency leak: supplied database now owns Record-engine reads, with denial-before-transaction regression. Organization/partner mocks implement current locks/scoped delegates. |
| SQL executing in hermetic mode | Environment isolation defect: explicit guarded verification opt-in for three concurrency suites; clear ordinary Prisma URLs in hermetic runner. Discovery includes the suites. |
| Shared seeded Facility/global counts | Fixture contamination: canonical seed Facility selection, unique Catalog lineage, snapshot Catalog assertions, isolated offline compatibility fixture, current grants and typed CSV headers. |
| Repair / Asset Issue / Asset duplicate codes | Actual concurrent product defect: two forward migrations and atomic sequence allocation through existing owners. Existing code strings/history preserved; rollback gaps accepted. |
| Support foreign-key race and missing notifications | Actual product defects: recipient locking and ticket-scoped dedupe with legacy-key replay compatibility. Ordered atomic disposable cleanup and bounded dispatcher draining correct independent fixture assumptions. |
| EVS customer success expectations | Obsolete pre-commercial-policy assertions: current SQL proves denial and retained-history integrity, without enabling EVS or bypassing lifecycle/Records controls. Positive pure expansion remains. |
| Assignment/Dietary account and plan fixtures | Fixture defects: real synthetic activation, explicit canonical User/Employee linking, effective grants, required confirmation, fixture-specific DRAFT reset and current Runtime selectors. No password/PIN enforcement bypass. |
| Next traces | Supported Next 16 output exclusions added for tests/docs/tmp. Current build passes. The old redundant Prisma external-package assertion was corrected; prior trace inspection found no docs/tests inclusion. |
| Retained database reseed | Environment unsuitable for the empty-database gate: sample employees now have operational repair history. Failed seed attempt retained; use a new isolated database, never delete history/reset. |

## Remaining browser boundary — R07-01B

The required offline job has **four passing / three failing** cases. Exact failures are:

- `scenario-05 @ci-gate: Authorized Unit Workspace bundle is cached through IndexedDB`.
- `scenario-07/08/09/11/12/13 @ci-gate: Offline Ready queue, refresh, sync exactly once`.
- `scenario-27 @ci-gate: Sign-out does not expose the prior user’s cached data`.

All stop at `tests/offline-browser/helpers.ts` awaiting the retired `unit-workspace`. The other four pass service-worker/shell/cache/reconnect checks; none substitutes for the three failing outcomes. The offline runner disables Job Flow, and its mutation setup still begins as an administrator without an operational Department relationship. Fixtures/routes must be brought into alignment with current authority and space execution before declaring these outcomes covered.

The Dietary gate has **four passing / one failing** case: `quick pin unit workspace ready started offline @ci-gate`. After replacing only the retired workspace assertion with `employee-runtime-experience`, a focused run proves real Quick PIN login/current Runtime mounting and fails at missing `offline-runtime-status`. The trace shows a confirmed responsibility but **No assigned spaces** and no Work/Evidence. Thus the failure is no longer merely the old selector; subsequent offline controls/queue/recovery assertions are **not reached**.

Source review: `employee-runtime-page.tsx` adds servery chrome only for executable assigned space views with legacy servery milestones; `servery-action-chrome.tsx` suppresses legacy meal controls for `isCurrentPeriodModel`. `space-workspace-page.tsx` also checks the canonical milestone presentation. Existing controls/API/storage code therefore does not prove this tested Neighborhood supports offline operation. No new Runtime store or unconditional Ready control was added.

**Follow-up options:** (1) prepare a canonical space/profile/confirmed-assignment fixture through existing owners and migrate the required journeys to the supported execution route, retaining the same caching, exactly-once replay, conflict and sign-out assertions; reproduce the first missing owner behavior there and review any bounded bridge separately. (2) If the legacy Ready contract is to be retired, explicitly approve a current Period/Key Time offline contract and replacement CI journey before retiring old assertions. Neither option is an implicit waiver; adding current offline capability or changing product promises is outside this stabilization-only patch. A compatibility-only API pass cannot certify the current customer journey.

No authorization, availability, publication, transaction or scanning restriction was weakened. Remote GitHub CI has not run. Production scanner infrastructure and actual customer pilot acceptance remain pending under the existing blockers.

## Remaining database boundary — R07-01A

The latest complete empty-database checkpoint is `database-release-final.log`: **3,659 total / 3,650 passed / 2 failed / 7 skipped**; all 147 migrations and seed twice passed. Earlier four-failure checkpoint is retained, not relabeled. Current exact failed tests:

- `SQL workbook: bounded 25-row execution resumes committed references across requests`: Prisma P2034 at canonical child batch creation after the existing five attempts. The broad run recorded 52 retry events overall; PostgreSQL logs confirm serialization dependencies in User/access/SetupImportBatch paths. No isolation, lock, reviewed-intent or authority checks were removed.
- `SQL: same global person across Facilities requires explicit account match and never overwrites global/home credentials`: confirmed row returned `failed` instead of `committed`. The persisted failed result is generic; it is **not proven** to have the identical root cause merely because serialization failures occurred nearby. This remains an unresolved current finding until the row's actual cause is isolated.

The two-case follow-up runs the unchanged tests together on a retained guarded database (`import-contention-focused.log`); its actual result is recorded in the inventory. A scoped pass is evidence of a contention-sensitive boundary, not closure of the red integrated gate. No assertion was relaxed to count a failed row as committed, no retry limit raised, and no SQL suite serialized/skipped to make it green.

**Next investigation/options:** correlate bounded failures with exact receipt/transaction failures; inspect case-insensitive identity lookup/index and Serializable predicate-lock scope across independent Facilities, then make a bounded owner/index correction if established. Alternatively, if product behavior intentionally exposes known rolled-back failures under sustained load, explicitly test and review the user recovery boundary while retaining the integrated stress outcome. Do not silently replace first-attempt/recovery guarantees, mask unknown outcomes or introduce unbounded retries. A broader transaction/identity-query redesign needs an explicit review, not an incidental onboarding expansion.


## Final allocator review follow-up

Review identified that explicit Asset imports may occupy a future numeric sequence value after migration. The existing canonical Asset allocator now checks each reserved value against existing identities, skips occupied codes (eight attempts), and retains its prior opaque fallback. It does not rewrite imported codes or weaken uniqueness. A real-database regression forces the first reservation to an existing imported code, then verifies a distinct automatic identity and unchanged imported row. The affected identity/closeout suites are rerun; their actual totals and the new final build are in the inventory. The latest broad database checkpoint precedes this bounded Asset-only follow-up and remains red on the same two import paths, which were not changed. No second broad run was performed.

## Package verification and preservation

Final tracking checks pass: discovery **444 files / 56 SQL suites**, normal Git-aware migration integrity **147 migrations**, hygiene **2,585 tracked files**. The repository's one existing documented historical checksum exception is unchanged; no new exception is invented. Three isolated targets each show147 disk/applied and zero mismatch/pending/unfinished. No production target was checked. Local edited documentation has79 valid file links, all onboarding JSON parses, and working/index diff hygiene passes.

The initial213 staged blobs are unchanged. All140 migration SQL files already in HEAD are unchanged, as are the original five staged onboarding migrations. Accepted commercial policy and historical ONB00–06 inventories/contracts remain byte-identical. Existing ONB07 records receive explicit current addenda/pointers; their earlier totals remain historical. New additions are normally tracked without a commit/push; stabilization edits to existing files remain unstaged for separate review.

Task-owned application servers and isolated PostgreSQL are stopped after checks; original data, builds, profiles and logs are retained. The unrelated pre-existing development server (observed PID75383 at cleanup) remains running. No scanner or production infrastructure was started/changed in stabilization.
