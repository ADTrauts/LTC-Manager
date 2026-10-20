# ONB-07 final review and commit/CI handoff

October 19, 2026 — ADTrauts/LTC-Manager, HEAD `3b5556e2ece0271a5bf7148ab61486537b61fbba`.

**Verdict: FR-01 / R07-07 corrected and locally passing; candidate ready for final review and separately authorized commit/draft-PR/remote CI. Release HOLD; ONB-07 incomplete.** Build `kM54rZEnzG5pildBnjPxm`; 10 focused guard regressions and 16 distinct affected desktop/tablet cases pass. Initial index/staged work and overlays are preserved. No commit, push, PR, remote-CI run, deployment or live operation occurred.

[Exact inclusion plan](./ONB_07_CANDIDATE_INCLUSION_2026-10-19.json) · [Correction/evidence](./ONB_07_SPACE_DATE_LOCK_2026-10-19.md) · [Current verification](./ONB_07_SPACE_DATE_LOCK_VERIFICATION_2026-10-19.json) · [Release blockers](./ONB_07_RELEASE_BLOCKERS.md). [Pre-correction review](./ONB_07_FINAL_REVIEW_PRE_FR01_2026-10-19.md), [pre-correction manifest](./ONB_07_CANDIDATE_INCLUSION_PRE_FR01_2026-10-19.json) and original final-review verification/probe remain historical.

## Findings and disposition

**FR-01 / R07-07 — P2: corrected; local gate PASS.** Idle and foreground checks now use the existing lease/date/context guard. Invalid context removes instructions/Space labels/mutation/replay controls and tab secrets, while retaining encrypted pending command identities. Preparation and decrypt results revalidate before restoring keys/content; public shell advances to v3 without clearing space/1 storage. Online-only fresh same-actor recovery remains explicit review without old instructions or new offline actions. No server authorization, replay owner, operational-date formula, lease limit or schema changed.

Real New York midnight proof: idle locking **876.6 ms desktop / 873.0 ms tablet**; focus/visibility **10.8–13.1 ms**. Six real boundary/recovery cases, ten directly affected existing journeys and ten hermetic public-guard cases pass across run-specific logs. The [correction record](./ONB_07_SPACE_DATE_LOCK_2026-10-19.md) identifies exact paths/build, failed attempts, selected evidence, reuse and controlled-clock limits. Original failed probe `tmp/onb07-final-review/date-boundary-probe.{mjs,json,log}` is unchanged, not relabelled as a pass.

**Evidence limitation:** the old reload test overwrote two auxiliary unversioned screenshots at `tmp/onb07-space/offline-{tablet,chromium}.png`. Original image bytes were not recovered; do not cite those paths as old-build evidence. They were absent from historical hashed inventories, whose referenced logs/manifests are preserved. Future screenshots now use the run-specific Playwright output path. This unexpected artifact change is explicitly flagged in the current inventory/manifest.

**FR-02 — stale pilot prerequisite documentation. Corrected in the preserved pre-correction review.** The pilot checklist still named only five migrations and omitted explicit managed offline-key/timing-writer cutover checks. It now requires all ten program migrations / 150 total, final working-tree overlays, FR-01 closure and the managed-key/mixed-version prerequisites. Its previous bytes and the previous release-blocker list are retained in `tmp/onb07-final-review`. The current blocker list closes R07-07 locally while retaining prior local passes and intermittent findings.

No other actionable defect was confirmed in the focused inspection below. This is not an exhaustive security audit or a production certificate.

| Reviewed risk | Owners and conclusion |
|---|---|
| Authorization / identity / lifecycle | ONB-01 update service, shared import authority/planner/executor/activation, canonical onboarding/account activation and manager invitations. Omitted fields stay separate from clears; updates cannot create or change lifecycle/authority. Create/reuse requires explicit account consent, Facility scope and canonical membership. Existing credentials are preserved; PIN enrollment/activation remain separate. |
| Commercial access / service payment replay | D09/D13–15, department catalog/status/mirror, recurring checkout, implementation authority/quote/payment/source sharing. Recurring checkout excludes service lines; approved scope/digest, durable exact provider requests, same-key recovery, complete history reconciliation and paid/expired checks remain. Staff and customer foreign keys stay distinct; service payment grants no entitlement/publication. |
| Workbook dependency retirement / receipts | D23 planning/service and canonical CSV transaction owner. Only receipt-backed completed unused People retire; pending local/literal/resolved consumers and legacy versions remain protected. Signed version/intent, live authority, mapping-to-receipt comparison and atomic effects/receipts/mappings remain. Twenty-five attempts do not guarantee twenty-five commits; uncertain outcomes reconcile the same identity. |
| Offline cryptography / isolation / reconnect | Server keyring/AAD, credential proof/recovery, issuance/replay, public encrypted store/renderer, API/body/SW/auth integration. Tab secrets stay outside IDB; locked intent needs online current same-actor recovery. Current scope, assignment, licensing, publication and target facts remain checked; effects/receipts share transactions. The corrected FR-01 idle/foreground date gate now passes locally. |
| Private originals | TLS allowlisted scanner client, bounded PENDING processor/attempt binding, worker/preflight/clamd limits and both staff-only download owners. Exact hash/size, maintained signatures/engine, fail-closed quarantine and post-read staff authorization remain. Production infrastructure is still unverified. |
| Schema / deployment coupling | Ten forward migrations and final schema/runtime dependencies. Existing applied SQL is unchanged. New enums, sequences, tables, nullable offline columns and timing parent fence must precede their users. No reset, backfill of historical meaning or new checksum exception. |

Partner membership-end and PM replacement failures remain **unexplained intermittent findings**, along with the retained intermediate partial-recovery exhaustion. Their assertions pass in the latest integrated checkpoint, but no causal fix or harmless baseline is claimed. No concrete new connection justified reopening those investigations here.

## Exact candidate reconciliation

The preserved pre-correction review proposed 349 paths: 247 staged paths / 2,612 index entries plus overlays and three handoff documents. The corrected inclusion plan is **355 exact paths**, including two new test files, the correction report/inventory and byte-for-byte copies of the old review/manifest. No staging or index rewrite occurred. Current per-layer counts and every final worktree hash are in the manifest.
Every existing path is listed with HEAD/index blob, final working SHA-256, layer status, provenance and inclusion reason. **Take final working-tree bytes**, including all overlays; an index-only commit would omit tested schema, transaction, workbook, offline and stabilization fixes. The original 213-path accepted package had no unrelated unstaged overlay; subsequent changes are mapped to authorized D18–D24 work. **No unrelated non-ignored delta was identified.** This classification does not authorize adding future unexpected changes.

Keep ignored secrets/local `.env` files, generated `.next*`, `node_modules`, `tmp` logs/builds/profiles/downloads and unrelated new changes out. `.env.example`, worker sources/configuration and dependency locks are explicit inclusions. Local evidence artifacts remain local and are not available merely by cloning the PR; hashes/paths identify retained proof, not uploaded artifacts.

**Recommended grouping: one coherent commit, one integration PR**, with three review sections:

| Section | Exact paths | Contents |
|---|---:|---|
| C1 | 174 | Complete runtime, schema/all ten migrations, dependency locks, public/offline code, release configuration and private worker. Includes all cross-owner billing/import/offline/stabilization changes. |
| C2 | 128 | Meaningful regressions, canonical fixture repairs, seed/verification harness and affected browser coverage. No retired Runtime restoration or authorization exceptions. |
| C3 | 53 | Accepted contracts/decisions, historical inventories, current certification/blockers/pilot guidance and these three handoff records. |

Proposed commit/PR title: **Complete canonical onboarding and bounded SPACE offline with release certification**. PR body should lead with the delivered entry/import/service/offline behavior, explain FR-01's corrected date locking and retained command recovery, list local versus remote evidence, and explicitly retain production/pilot exclusions. Do not call the program rolled out or pilot accepted.

After explicit authorization: reconcile the 355 reviewed paths/hashes against the preserved index and reject unexpected deltas; stage only final working bytes using `git --literal-pathspecs add --pathspec-from-file=tmp/onb07-date-lock/candidate-paths.nul --pathspec-file-nul`; inspect the complete staged diff/name/mode/migration integrity; commit once; create one **draft** integration PR and run the normal remote gates. The exact candidate and C1/C2/C3 NUL path lists are prepared, not executed. Literal matching protects bracketed Next routes. An index-only commit would omit final fixes. Do not commit C1 alone from the current mixed index. Any split needs separately approved isolated preparation; no reset/index rewrite belongs to this task.

## Local evidence versus required remote CI

Reused build `5S9jh0r0wyAcpcoCpYyXY`: integrated **3,684 pass / 0 fail / 7 skip**, migration-150/seed twice/schema assertions, workbook browser **8/8**, concurrent group **59/0/1** and pure workbook **13/13**. Four of its 286 source paths now differ: the three intentionally corrected public scripts and an artifact-path-only browser harness change. Database/workbook/authority/schema owners are unchanged; those gates are reused, not rerun.

SPACE SQL/replay/auth evidence from build `eYn2LNGJB_kx6ATlH7XPy` remains reused: final affected group **20/20**, unchanged PIN/other journeys within the original inventory's limits. Changed public-renderer journeys are verified on the new build. Worker/scan owners and the local real-ClamAV proof remain historical/reused, not production certification. Failed/interrupted attempts remain; overlapping totals are not summed.

New checks: corrected build/TypeScript, 10 guard regressions, 16 distinct relevant real customer cases selected across retained logs, final focused lint, exact served-script/source hashes, index/manifest/history/evidence preservation and document/diff checks. The correction inventory labels each run/reused/not-run result and known artifact limitation. No unchanged full-suite, broad browser/database replay or migration deployment.
The existing `.github/workflows/verify.yml` requires all five remote jobs against the final authorized PR tree, using **Node 20** and **PostgreSQL 16** where applicable:

1. **Static and hermetic:** `npm ci` (Prisma generation), discovery, migration integrity, tracked-file hygiene, standalone hermetic tests, typecheck, full lint, Prisma validate and production build. The SQL-enabled all-test run is not a substitute for standalone hermetic mode.
2. **Database integration:** disposable-target refusal, full forward deploy, seed twice, all SQL-backed/integrated tests and schema assertions; the workflow also checks guarded rate-limit maintenance dry-run and execution on its disposable target.
3. **Offline browser gate:** current canonical SPACE desktop/tablet caching/reload/mutation/replay/conflict/sign-out obligations.
4. **Assignment browser gate:** current canonical publication/confirmation/access boundaries.
5. **Dietary pilot gate:** synthetic integrated customer/real-PIN journeys, not actual pilot acceptance.

Do not skip jobs, suppress findings or treat local Node24/PostgreSQL14 as remote success. Remote logs/build IDs/commit SHA and artifacts must be recorded after they actually run. The extra onboarding/service/workbook Playwright configurations currently have local evidence and are not automatic jobs in this workflow; do not claim they ran remotely. Any supplemental CI wiring/run must be explicit, use isolated data/providers and retain the existing mandatory gates. No CI trigger occurs in this task.

## Migrations and production cutover prerequisites

The exact migration paths/checksums are in the inclusion manifest. Preserve order:

| Order / suffix (all under `prisma/migrations/`) | Runtime dependency |
|---|---|
| `20261017180000_onboarding_commercial_suspension_states` | UNPAID/PAUSED mirrors and suspended access |
| `20261017230000_guided_setup_entry_and_manager_invitations` | Entry confirmation and real invitation lifecycle |
| `20261018010000_canonical_setup_import_receipts` | Shared canonical import plans/results/leases |
| `20261018120000_implementation_service_orders` | Engagement/quote/approval/payment/audit/share aggregate |
| `20261018150000_support_private_attachment_scanning` | Scan leases/attempts/hash/version metadata |
| `20261018233500_onb07_repair_code_allocation` | Atomic Repair identifier sequence |
| `20261018234500_onb07_asset_issue_code_allocation` | Asset Issue/Asset allocators; preserve imported collisions |
| `20261019110000_onb07_import_identity_lookup_indexes` | Bounded case-normalized identity predicates |
| `20261019190000_canonical_space_offline` | Issuance escrow/scope and atomic transport receipt metadata |
| `20261019200000_offline_timing_adjustment_fence` | Existing Cycle parent revision for canonical timing/replay |

Normal tracked checksum governance and intended-target applied history must pass before any separately authorized deployment. Apply pending migrations **before** new runtime/worker use; generate the final Prisma client and restart/rebuild consumers. Do not edit shared/applied SQL or reset/reseed customer databases. Sample seed is verification-only and may conflict with retained operational history.

Treat the final runtime as one release unit. Do not expose new enum values/paths to incompatible old clients, run sequence users before migration, or enable canonical offline while any old timing writer omits the parent revision/Facility→Cycle lock order. Nullable metadata preserves historical compatibility; it does not certify mixed writers or authorize rewriting old records. Keep key IDs needed by historical pending intent. No feature rollback may erase receipts, identities, paid orders, published/operational history or queued ciphertext; use attributable forward corrections.

Before original-file delivery: approved private Blob/worker hosting/network, verified TLS/CA and bearer secret custody, internal-only clamd, maintained pinned engine/image/signature updates, health/limits, named owner/on-call, support-specific PENDING scheduling, private retention and authorized hash-verified staff-only download. No customer original goes to an unapproved host. Local benign/EICAR proof does not provision this.

Before SPACE offline availability: managed server-only AES-256 recovery keyring/active key, HTTPS, secret distribution, rotation/retention/backup and accountable recovery owner; all timing writers upgraded; intended-target same-actor recovery, expiry, isolation and partial replay verified. No default production recovery key or plaintext/instance-local fallback.

Public signup stays disabled/unmodified. Normal subscription charges and separately approved assistance/Owner waivers remain D09/D13-bound. No deployment, live charge, customer data, external message or activation permission is implied by a green PR.

## Pilot and approval handoff

Facility/workflow, chosen AVAILABLE Department(s), accountable customer/publication approver, VSSYL delivery/support owners, training/support window, fallback and live authorization remain pending. Record observed customer/staff active/waiting effort and actual customer acceptance of delivered/deferred scope and the real published/used workflow. Synthetic journeys or service acceptance alone cannot satisfy actual pilot acceptance. Use the corrected [pilot checklist](./ONB_07_PILOT_CHECKLIST.md).

Next bounded step is explicit authorization for the reviewed integrated commit, draft PR and mandatory remote CI. Production provisioning/deployment and live pilot require their own later approval. **ONB-07 remains incomplete.**
