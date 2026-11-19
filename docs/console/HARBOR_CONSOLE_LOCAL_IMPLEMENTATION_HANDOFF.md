# Harbor Console — local implementation handoff

**Position:** the selected Phase 3–5 implementation passed the owner-authorized combined local gate. See [actual evidence and resolved failures](HARBOR_CONSOLE_OPERATIONS_LIFECYCLE_CERTIFICATION_2026-11-19.md). Commit/push and draft review are authorized; exact-head hosted checks remain attached to the published review. No merge or production promotion is authorized. Do not expand feature scope to fill deferred policy work.

## Branch and dependency

- Branch: `feat/harbor-operations-lifecycle-batch`.
- Worktree: `work/harbor-operations-batch` under the shared Codex workspace.
- Base: PR #41 reviewed head `9d9988e3e72c5c4117a119194c5c379d1473fa07`. PR #41 and its branch remain unchanged and unmerged by this batch.
- Review must account for #41 as an explicit dependency and reconcile with current `origin/main` without overwriting newer work. The owner authorized commit/push and draft review after local verification, but no merge. The November 19 preflight confirmed `origin/main` remained `38d10725f9af141fe4e5d2ecca69e8a503458a5d`, already an ancestor of this branch.

## Phase-level finish line

| Phase | Actual implemented scope | Position |
| --- | --- | --- |
| 3 — provisioning/onboarding/recovery | Existing create → invite/recover → setup → request → claim/assigned → continue path from #41, with lifecycle return links | Connected Chromium journeys passed. No extra onboarding feature added. |
| 4 — daily SaaS operations | Nine bounded queues, exact handling links, pending-reply age, scan scheduling/attempt diagnostics and canonical billing/licensing/Catalog reads | Local SQL, authority, read-only, scanner regression and Chromium checks passed. Hosted checks and provider evidence remain separately scoped. |
| 5 — customer lifecycle/final certification | Owner-selected read-only facts, contextual follow-up and assigned participating work; refreshed views after existing handling | Selected local scope passed. Production certification remains separately gated; new lifecycle commands are future scope. |

Earlier Phase 0–2 work is inherited, not recertified here. Phase 1D remains audit attribution, not onboarding; this handoff does not declare that broader program complete.

The core new files are `src/lib/harbor-console/{operations,scan-diagnostics,customer-lifecycle}.ts`, their three server-rendered Console pages, `src/components/harbor-console/operations-ui.tsx`, and `src/lib/support/scan-scheduling.ts`. Existing navigation, timeline/rule anchors, invitation/billing forms and action revalidation connect them. The full changed-path groups and reader boundaries are in [the batch notes](HARBOR_CONSOLE_OPERATIONS_LIFECYCLE_BATCH.md#main-changed-paths).

## One combined verification gate

The owner explicitly lifted the earlier deferral. The single [combined validation gate](HARBOR_CONSOLE_OPERATIONS_LIFECYCLE_BATCH.md#combined-validation-gate) covers hermetic/route authorization, disposable PostgreSQL and no-write/negative proofs, scanner timing and processor parity, type/lint/build, actual signed-in browser workflows and exact-head GitHub Verify. Its completed results, actual fixes and verification limits must accompany the draft PR. No hosted test fixtures or database changes are part of the gate.

Local results: Node 20 TypeScript, changed-file lint, standard production build and schema/integrity checks passed; hermetic 3,424 passed/346 skipped/zero failed; full SQL gate 3,823 passed/seven real-provider cases skipped/zero failed; five isolated Chromium journey specs passed, followed by the expanded critical Operations destination/role checks. Exact-head GitHub results are recorded on the draft PR after publication.

## Separate environment and release gates

| Gate | Required evidence or approval; not performed by this batch |
| --- | --- |
| Assistance pilot | Preserve its dedicated branch, database, protected gate and approvals. Any new activation, grants, permissions or pilot mutation needs its own explicit authorization. Metadata/status screens do not enable assistance. |
| Real staff lifecycle | Preserve existing roster eligibility, verified work-email/MFA, action-bound reauthentication, independent recovery/OWNER approval and last-owner rules. Real work domains, trusted roster and independent recovery approver must be designated/configured before real enablement; synthetic code evidence is insufficient. |
| Provider operations | Obtain actual approved message delivery/callback, scanner/private Blob and scheduler evidence before claiming live health or enabling sensitive functionality. Config presence, age, lease state and a historical success do not establish current provider liveness. |
| Hosted migrations | This batch adds no migration. Verify each intended target's existing ledger/schema and applicable receipt protections during an authorized release preparation; do not infer a hosted ledger from local source. Hosted migration and target/binding changes remain separately gated. |
| Historical Catalog inventory | Preserve the prior production-enablement inventory requirement. Synthetic ownership tests do not verify historical customer records; no production data was accessed here. |
| Release | Review exact-head hosted Verify and the reconciled commit, then obtain applicable merge, protected candidate and production promotion approvals. No domains, shared deployment settings, hosted databases or Production resources were changed here. |

The owner-selected first release keeps the existing approved billing enforcement, recovery, Support and Implementation actions. Manual suspension/reactivation, bulk/full-customer export and offboarding/deletion are deferred to a separately approved future scope, described in [the scope brief](HARBOR_CONSOLE_LIFECYCLE_COMMAND_DECISIONS.md). Those future policies are not blockers to this selected release.
