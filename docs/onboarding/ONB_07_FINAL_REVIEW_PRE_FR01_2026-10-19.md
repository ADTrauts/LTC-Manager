# ONB-07 final review and commit/CI handoff

October 19, 2026 — ADTrauts/LTC-Manager, HEAD `3b5556e2ece0271a5bf7148ab61486537b61fbba`.

**Verdict: review package prepared; final commit freeze blocked by FR-01. Release HOLD; ONB-07 incomplete.** R07-01A and the recorded canonical SPACE local gates remain passing evidence within their tested coverage. This review found a new, bounded date-boundary defect; it does not erase those results or reopen their resolved investigations. No application code, index, migration SQL or historical evidence was changed. No commit, push, PR, remote-CI run or live operation occurred.

[Exact inclusion plan](./ONB_07_CANDIDATE_INCLUSION_2026-10-19.json) · [Review verification/evidence](./ONB_07_FINAL_REVIEW_VERIFICATION_2026-10-19.json) · [Current release blockers](./ONB_07_RELEASE_BLOCKERS.md).

## Findings and disposition

**FR-01 / R07-07 — P2: idle operational data and wrapping secret survive the Facility date boundary. Open; correct before final freeze.**

`public/space-offline.js:136–142` checks `expiresAt` in its idle timer, while the existing `live` guard in `public/space-offline-store.js` also rejects a changed Facility-local operational date. Server issuance may validly cross midnight: `src/lib/offline/space/service.ts:92` bounds the lease by 12 hours/JWT/role/assignment end, and `OperationalAssignment.endsAt` is optional. The idle renderer therefore keeps yesterday's instructions and tab wrapping secret until another read/action invokes the guard.

A focused Chromium probe installed synthetic encrypted instructions at 23:59:50 UTC, advanced to 00:00:10 with a still-valid lease, and observed the instructions/key still present. An immediate on-demand read rejected with “Offline authorization expired” and locked access. **No unauthorized server write is demonstrated; the proven defect is idle display/key locking.** HTTP was intercepted locally and no database/provider/customer data was used. This is an isolated renderer probe, not a new customer-journey certification. Full script/output: `tmp/onb07-final-review/date-boundary-probe.{mjs,json,log}`.

Bounded correction: have idle and foreground validation reuse the same existing lease/date/context guard before leaving operational content visible. On invalid context, clear instructions/Space label/actions and tab wrapping secrets while preserving encrypted pending intent. Preserve online-only same-actor recovery, no offline renewal/unlock and existing replay owners. This needs no new product policy or server executor. Do not change the accepted operational-date contract to accommodate the bug.

Acceptance: a near-midnight preparation with a lease crossing the Facility date locks within the existing timer interval and on foreground restore; one queued command remains encrypted and intact; new actions reject; fresh online same-actor recovery permits explicit intent review without restoring expired operational instructions. Include a non-UTC Facility timezone and a normal pre-boundary control. Advance the service-worker cache version for changed public scripts. Run the focused regression and affected desktop/tablet expiry/reload/sign-out/recovery checks against a relevant rebuilt application; reuse unchanged database replay/authorization evidence if those owners remain unchanged. Refresh the manifest and evidence after correction. **No runtime correction is included or claimed here.**

**FR-02 — stale pilot prerequisite documentation. Corrected in this review.** The pilot checklist still named only five migrations and omitted explicit managed offline-key/timing-writer cutover checks. It now requires all ten program migrations / 150 total, final working-tree overlays, FR-01 closure and the managed-key/mixed-version prerequisites. Its previous bytes and the previous release-blocker list are retained in `tmp/onb07-final-review`. The blocker list adds R07-07 while retaining prior local passes and intermittent findings.

No other actionable defect was confirmed in the focused inspection below. This is not an exhaustive security audit or a production certificate.

| Reviewed risk | Owners and conclusion |
|---|---|
| Authorization / identity / lifecycle | ONB-01 update service, shared import authority/planner/executor/activation, canonical onboarding/account activation and manager invitations. Omitted fields stay separate from clears; updates cannot create or change lifecycle/authority. Create/reuse requires explicit account consent, Facility scope and canonical membership. Existing credentials are preserved; PIN enrollment/activation remain separate. |
| Commercial access / service payment replay | D09/D13–15, department catalog/status/mirror, recurring checkout, implementation authority/quote/payment/source sharing. Recurring checkout excludes service lines; approved scope/digest, durable exact provider requests, same-key recovery, complete history reconciliation and paid/expired checks remain. Staff and customer foreign keys stay distinct; service payment grants no entitlement/publication. |
| Workbook dependency retirement / receipts | D23 planning/service and canonical CSV transaction owner. Only receipt-backed completed unused People retire; pending local/literal/resolved consumers and legacy versions remain protected. Signed version/intent, live authority, mapping-to-receipt comparison and atomic effects/receipts/mappings remain. Twenty-five attempts do not guarantee twenty-five commits; uncertain outcomes reconcile the same identity. |
| Offline cryptography / isolation / reconnect | Server keyring/AAD, credential proof/recovery, issuance/replay, public encrypted store/renderer, API/body/SW/auth integration. Tab secrets stay outside IDB; locked intent needs online current same-actor recovery. Current scope, assignment, licensing, publication and target facts remain checked; effects/receipts share transactions. FR-01 narrows idle-date coverage. |
| Private originals | TLS allowlisted scanner client, bounded PENDING processor/attempt binding, worker/preflight/clamd limits and both staff-only download owners. Exact hash/size, maintained signatures/engine, fail-closed quarantine and post-read staff authorization remain. Production infrastructure is still unverified. |
| Schema / deployment coupling | Ten forward migrations and final schema/runtime dependencies. Existing applied SQL is unchanged. New enums, sequences, tables, nullable offline columns and timing parent fence must precede their users. No reset, backfill of historical meaning or new checksum exception. |

Partner membership-end and PM replacement failures remain **unexplained intermittent findings**, along with the retained intermediate partial-recovery exhaustion. Their assertions pass in the latest integrated checkpoint, but no causal fix or harmless baseline is claimed. No concrete new connection justified reopening those investigations here.

## Exact candidate reconciliation

At review entry: **247 staged paths, 136 overlays, zero untracked; 346 unique changed paths**. The two documentation corrections above leave **247 staged, 137 overlays**: 38 paths have both layers, 209 are index-only, 99 overlay-only. Three new handoff documents are intentionally untracked. Proposed final inclusion is **349 exact paths**.

Every existing path is listed with HEAD/index blob, final working SHA-256, layer status, provenance and inclusion reason. **Take final working-tree bytes**, including all overlays; an index-only commit would omit tested schema, transaction, workbook, offline and stabilization fixes. The original 213-path accepted package had no unrelated unstaged overlay; subsequent changes are mapped to authorized D18–D23 work. **No unrelated non-ignored delta was identified.** This classification does not authorize adding future unexpected changes.

Keep ignored secrets/local `.env` files, generated `.next*`, `node_modules`, `tmp` logs/builds/profiles/downloads and unrelated new changes out. `.env.example`, worker sources/configuration and dependency locks are explicit inclusions. Local evidence artifacts remain local and are not available merely by cloning the PR; hashes/paths identify retained proof, not uploaded artifacts.

**Recommended grouping: one coherent commit, one integration PR**, with three review sections:

| Section | Exact paths | Contents |
|---|---:|---|
| C1 | 174 | Complete runtime, schema/all ten migrations, dependency locks, public/offline code, release configuration and private worker. Includes all cross-owner billing/import/offline/stabilization changes. |
| C2 | 126 | Meaningful regressions, canonical fixture repairs, seed/verification harness and affected browser coverage. No retired Runtime restoration or authorization exceptions. |
| C3 | 49 | Accepted contracts/decisions, historical inventories, current certification/blockers/pilot guidance and these three handoff records. |

Proposed commit/PR title: **Complete canonical onboarding and bounded SPACE offline with release certification**. PR body should lead with the delivered entry/import/service/offline behavior, explain FR-01's eventual correction, list local versus remote evidence, and explicitly retain production/pilot exclusions. Do not call the program rolled out or pilot accepted.

After FR-01 correction and explicit authorization: refresh reviewed hashes/path lists; recheck that the index/unrelated state matches the preserved snapshot; stage **only** the exact 349-path list (plus any explicitly reviewed correction/test path), taking final working bytes; inspect staged diff/name/mode/migration integrity; commit once; create one draft integration PR and run the normal remote gates. `tmp/onb07-final-review/candidate-paths.nul` and C1/C2/C3 lists are prepared **but not executed**. Only after authorization, use `git --literal-pathspecs add --pathspec-from-file=tmp/onb07-final-review/candidate-paths.nul --pathspec-file-nul`; literal matching matters for bracketed Next route names. Do not commit C1 alone from the current mixed index. A later multi-commit/stacked-PR split needs separate isolated preparation and explicit index preservation; this plan calls for no reset or index rewrite.

## Local evidence versus required remote CI

All **286 paths in the latest checkpoint source manifest still match**. Build `5S9jh0r0wyAcpcoCpYyXY`: integrated **3,684 pass / 0 fail / 7 skip**, migrations 150/seed twice/schema assertions pass; workbook browser **8/8**; concurrent group **59/0/1**; pure workbook **13/13**; build/TypeScript and selected lint pass. These are **reused**, not rerun in this review. FR-01 is a newly confirmed gap outside those assertions, so the passing evidence is not final corrected-candidate proof.

SPACE evidence is reused within its recorded scope: build `eYn2LNGJB_kx6ATlH7XPy`, final affected group **20/20**, offline desktop/tablet **18/18**, changed real-PIN **2/2**, eight unchanged Dietary cases reused from the earlier ten-case run. Worker/scan code is unchanged; the prior real-ClamAV proof remains local historical evidence, not production certification. Failed and interrupted attempts remain in the dated inventories; totals overlap and are not summed.

New checks here: the isolated date-boundary probe; index/working-tree/provenance reconciliation; existing evidence/source hash checks; normal read-only migration integrity/hygiene/discovery and documentation/JSON/link/diff checks. No routine full-suite/build/browser replay or database was started.

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

Next bounded step is FR-01 remediation/verification, then explicit authorization for the reviewed integrated commit, draft PR and remote CI. Production provisioning/deployment and live pilot require their own later approval. **ONB-07 remains incomplete.**
