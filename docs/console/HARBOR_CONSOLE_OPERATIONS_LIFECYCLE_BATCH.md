# Harbor Console — local operations and lifecycle batch

## Operational connections follow-up — November 19, 2026

The owner approved and completed promotion of main `a77819f9182437938bcf2a5ba95408e26eb459f1` as deployment `dpl_BJHH9hbR4TeLJHvqWojcFKgfeexQ`; both public domains were observed assigned to it. Earlier unmerged/unpromoted statements below describe the original batch checkpoint. They do not reverse that subsequent approval.

The current follow-up is on `feat/harbor-operational-connections`. The owner explicitly stopped tests. No tests, builds, synthetic messages, scans, payment events or manual job executions are authorized by this documentation update or were run for the follow-up. The new source is local and unreleased.

- Private store `ltc-manager-private` (`store_WvnKrZ5UUUsYvWLq`) was observed available, private and in `iad1` through provider metadata; no objects were listed or transferred.
- Postmark server `Vssyl Production` (`19790638`) has a provider-verified outbound callback at `https://vssyl.com/api/support/email-events`, subscribed to Delivery, Bounce and Spam Complaint. The `vssyl.com` sender domain shows DKIM and Return-Path verified. The configured inbound stream shows `reply.vssyl.com`; its webhook value is masked, so its exact URL/credential match has not been established by this inspection. No Check/Test/Send control was used.
- The existing Vssyl Stripe account `acct_1UGiNYRFfs539UXR` showed no webhook destinations. Project environment metadata contained no Stripe key, webhook-secret or price-ID entries and reported zero hidden Production entries. That establishes the project-scoped gap; it does not establish all inherited configuration or approve new live prices/charges.
- A dedicated private scanner worker remains unprovisioned. The repository already contains its ClamAV image and bounded processor. The owner chose to keep scanning disabled. The prepared cron route, route registration and schedule were removed from the current follow-up; the prototype remains recoverable in local commit `35e8ae1c`. No host, Vercel upgrade, scanner credentials or download enablement is approved.
- The billing webhook now checks configuration before constructing the Stripe client, returning an explicit 503 when either required secret is missing instead of throwing before its configuration response. Signature verification and the existing reconciliation owner remain authoritative.

Scanner hosting and scheduling are deferred by the owner, not a blocker to continuing the other connections. Live Stripe credentials/catalog configuration remains incomplete where not already approved. Real staff roster/recovery-approver and deferred lifecycle-command policy remain later steps. No new first-customer pricing, customer authority, lifecycle commands or assistance activation is inferred from operational connection work.

The [worker deployment notes](../../workers/support-attachment-scanner/README.md#hosted-scanning-deferred--november-19-2026) record the owner’s decision to keep scanning disabled. Existing Support automation and Plant schedules and the live app remain unchanged by this local follow-up.

For the existing Stripe account, the application callback destination is `https://vssyl.com/api/billing/webhook`. Its ten handled events are `setup_intent.succeeded`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`. Match the installed Stripe SDK's API version (`2026-04-22.dahlia` at this checkpoint), rather than silently choosing the account's newer default version. Use a dedicated application credential with only permissions required by the existing billing services; no account-management or payout authority is needed. Keep the signing secret and app key private, scoped to Production. Configuring this callback does not require creating prices, customers, subscriptions or charges. The key-creation UI encountered a connection error before a form loaded; no key or destination was created, and provider setup remains incomplete.

### Exact Stripe access decision

After the scanner deferral, the Stripe key wizard loaded on the existing `Vssyl (ATraut Corp)` live account `acct_1UGiNYRFfs539UXR`. Its selected purpose is **Building your own integration**, not giving an agent ongoing account access. Automatic approval review rejected advancing the wizard because a persistent billing credential was not specifically approved. No key, access policy, callback destination or provider write was created. Do not retry or bypass that gate without the owner's explicit answer.

The proposed authorization is one app-specific live key, privately stored only as the Production application's `STRIPE_SECRET_KEY`, with the existing public key as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Its policy is read/write Customers, Checkout Sessions, Subscriptions, Setup Intents, Payment Methods and Billing Portal sessions/configuration; read-only Payment Intents for existing implementation-payment reconciliation. Grant only supporting read permissions actually required by those existing services. Deny payouts, transfers, refunds, account administration and general webhook-management access to this application key. If Stripe cannot express that bounded policy, return the actual limitation for a decision rather than creating an unrestricted key.

The same requested setup covers one account-only signed callback at the URL/version/ten events above and storing its signing secret privately as Production `STRIPE_WEBHOOK_SECRET`. Configure the callback through the owner's provider session, without giving the application key webhook-administration authority. Do not trigger a test event, replay, message, checkout, subscription, price change or actual payment. Do not publish/redeploy the app or enable a destination against an unconfigured live handler under this credential decision; record any activation/release step separately. Existing Preview/pilot secrets, staff authority, customer data and disabled scanning remain outside this action.

Status: implementation complete for the selected scope; **combined local verification passed**. Actual results and resolved failures are recorded in the [November 19 certification](HARBOR_CONSOLE_OPERATIONS_LIFECYCLE_CERTIFICATION_2026-11-19.md). The owner authorized testing, fixes, commit/push and draft review; no merge, hosted migration, pilot activation or Production approval is implied.

Branch: `feat/harbor-operations-lifecycle-batch`, based on PR #41 head `9d9988e3e72c5c4117a119194c5c379d1473fa07`. PR #41 and its branch are unchanged. Commit and push follow successful combined local verification; the draft review workflow retains #41 as an explicit dependency.

The owner selected **read-only customer lifecycle for the first Harbor release**, retaining existing approved billing, recovery, Support and Implementation actions. New manual suspension/reactivation, bulk/full-customer export, and offboarding/deletion commands are deferred future scope. They are not implementation or certification prerequisites for the selected first release. The scope is now bounded; no additional microphases or incidental onboarding work are planned in this batch. See the concise [local implementation handoff](HARBOR_CONSOLE_LOCAL_IMPLEMENTATION_HANDOFF.md).

## Phase completion list

| Roadmap phase | Position for this batch | Remaining finish line |
| --- | --- | --- |
| 0 — security boundaries | Existing baseline preserved | Retain the separate provider/inventory and production enablement gates in existing certifications. |
| 1 — staff authority, security, accountability | Existing identity, per-login validation, capabilities, assistance and lifecycle services reused | Existing policy/enablement boundaries still apply. Phase **1D is audit attribution**, not onboarding; this batch does not certify it complete. |
| 2 — Customer and Organization management | Existing canonical directory, Organization and Facility management reused | Combined regression review, not a new tenancy model. |
| 3 — provisioning, onboarding, recovery | Existing create → invite/recover → setup → request → claim/assigned → continue path preserved; the connected browser journeys passed | Actual external delivery and environment readiness remain separate. No extra onboarding feature is required for this selected batch. |
| 4 — daily SaaS operations | Nine connected queues, pending-delivery follow-up and scoped scan diagnostics passed local SQL, authorization, no-write and signed-in browser checks | Exact-head hosted Verify and normal review; provider reachability and scheduler liveness require separate evidence. |
| 5 — customer lifecycle and final certification | Selected read-only lifecycle/status and authorized follow-through passed the combined local gate | Exact-head draft verification and separately approved release remain. New lifecycle commands are deferred future scope, not blockers to this release. |

## Implemented interfaces and sources

`/console/operations` is reachable from the Console sidebar and Today. It shows full aggregate counts and a stable, bounded 25-row page for the selected queue. Pagination preserves the queue and clamps out-of-range pages to the matching count. Each row continues in an existing authorized handling flow.

| Queue | Canonical fact and scope | Handling flow |
| --- | --- | --- |
| Unassigned Support | Existing `supportQueueWhere("unassigned")` active statuses | Existing ticket assignment and reply screen |
| High-priority Support | Existing `supportQueueWhere("high")` | Existing ticket screen |
| Delivery problems | OUTBOUND `SupportTicketMessage` rows with FAILED, BOUNCED, or SPAM_COMPLAINT | Existing conversation/delivery history; no new send/retry action |
| Unconfirmed outgoing replies | OUTBOUND rows with null/PENDING or SENT delivery status, ordered by reply creation | Exact message anchor in the existing conversation; elapsed age from creation or acceptance, without an invented SLA |
| Attachment scan backlog | `SupportTicketAttachment` PENDING or SCAN_FAILED | Existing ticket scan diagnostics; no originals or filenames in the overview |
| Failed automation runs | `SupportAutomationRun` FAILED | Existing ticket history and automation settings |
| Payment follow-up | `FacilityBilling` statuses from the shared `isPaymentProblem` set | Existing Facility billing diagnostics and separately authorized sync form |
| Unlinked active licenses | ACTIVE `FacilityDepartmentEntitlement` with no Department link | Facility lifecycle licensing projection; this is a linkage fact and may be normal during setup |
| Platform Catalog drafts | DRAFT `CatalogLogDefinition` using `PLATFORM_CATALOG_OWNER` | Existing Marketplace draft editor/history; existing `catalog.publish` decision remains Owner-only |

Scan backlog filters reuse the processor's existing lease/retry predicate, partitioning pending/failed attachments into eligible, unexpired lease, scheduled retry, and explicit-review states. The existing 90-second lease, three-attempt cap, and 60/300-second backoff were extracted into `src/lib/support/scan-scheduling.ts` and reused by the processor; their values and claim-time rechecks are preserved. No worker is executed, timer installed, or hosted schedule configured.

`/console/operations/scans/[attachmentId]` is a separate read-only Harbor route showing current scheduling facts and the newest ten persisted attempts plus the full attempt count. It selects no filename, bytes, storage key, hash, lease token, or provider error body. Result codes and attempt statuses are allowlisted for presentation. It links to the exact Support message and, only for recorded participants without a retired work context, to the existing Implementation engagement. The existing source action still checks engagement/source authorization before any explicit failed-source rescan. No general rescan command or implicit participation is introduced. Support attachments now link to these diagnostics.

Delivery queues deep-link to exact message anchors added to the existing timeline. A pending send is distinguished from provider acceptance without a delivery receipt; configured callback/reply-routing credentials are not asserted to prove provider reachability or a message's outcome. Failed automation rows also show their rule's **current** configured delay and state using the existing timing formatter and link directly to that rule's existing handling form; this is not a reconstruction of past rule configuration.

Historical message and job failures are explicitly historical, not a new unresolved-incident model. Their counts measure messages/runs, not customers. A later success does not silently erase history. Scanner configuration and private-storage credential presence are presented separately from actual integration health. Latest persisted scan/automation evidence is timestamped and is not scheduler liveness. The overview never invokes a processor, provider request, rescan, download, send, or reconciliation.

Today's payment preview now counts all matching Facilities before selecting five, shares the payment-status predicate with Operations, and links to the full Operations queue. It no longer derives a purported global count from the first 200 directory entries.

`/console/customers/[facilityId]/lifecycle` is linked from the directory, Facility overview, and licensing queue. It composes:

- Canonical Organization state and `loadFacilityAdministratorSeat`, without a legacy-role fallback.
- Existing account-activation projection for Owners only; no identity, recovery target, password material, or invitation token in this projection.
- Recorded setup start, entry confirmation and acknowledgment, without treating acknowledgment as operational readiness.
- Existing staff Implementation work counts and Support status counts; no detailed engagement scope, imports, originals, or automatic participation.
- `deriveFacilityDepartmentCatalog` release, licensing, installation, Enabled, entitlement and operation-eligibility facts from the canonical local mirrors. Department/entitlement reads are capped at 200 each and independently counted; if either is truncated, no partial licensing result is reported.

The continuity section now derives concrete follow-up links from those facts: governance review, Owner-only missing/expired invitation recovery, existing Support before preparing another ticket, open Implementation assignment, and commercial installation/reconciliation review. A three-row preview of the viewer's assigned **participating** open work links to specific engagements; it is withheld with the retired work context. Neither a zero follow-up list nor an empty work preview certifies readiness. Existing invitation and billing forms link back to current lifecycle status after a result. Their actions, Support actions and staff Implementation actions invalidate the affected new projections alongside existing handling pages. No new mutation service or automatic provider request is added.

The final bounded connection pass also invalidates the exact scan diagnostics page after an existing authorized Implementation rescan request. The prior Operations-page invalidation alone did not name this nested detail page. No rescan authority, processor execution or retry policy changed.

The three new readers use PostgreSQL read-only RepeatableRead transactions and validate the existing live Harbor login before reading. They revalidate against a fresh database read before returning, so a completed logout or staff-authority change observed during assembly denies the projection. This is read authorization, not a new permission engine or protected-write lock protocol. A retired work cookie never grants customer authority; Implementation counts remain unavailable until its explicit cleanup. The new routes are registered as Harbor-only and server-rendered dynamically. New links disable prefetch. No offline store or page cache is introduced.

The existing activation reader was factored into a transaction-composable function; its existing public wrapper and recovery behavior are preserved. Shared server presentation components provide panels, facts, links, and UTC timestamps. No schema, migration, identity store, Catalog, permission engine, attachment system, or readiness score is added.

## Selected lifecycle scope and deferred future commands

Existing approved account-recovery and billing controls remain in their owning flows. The [scope and future command brief](HARBOR_CONSOLE_LIFECYCLE_COMMAND_DECISIONS.md) records the owner's selected read-only first release and separates it from proposals for manual suspension/reinstatement, bulk/full-customer export, and offboarding/retention/deletion. Future implementation would require its own actors, ownership, notice, preservation and recovery rules; none are invented here.

Deferred command decisions do not block the selected release. No inactive controls or command endpoints are added as placeholders. The selected Phase 3–5 implementation passed its combined local gate with no unresolved local failures. This is not whole-program or Production certification: exact-head hosted checks, normal review and the existing environment-specific enablement/release gates remain separate.

## Main changed paths

- Operations: `src/lib/harbor-console/operations.ts`, `src/app/console/(staff)/operations/page.tsx`.
- Scan diagnostics: `src/lib/harbor-console/scan-diagnostics.ts`, `src/app/console/(staff)/operations/scans/[attachmentId]/page.tsx`, and `src/lib/support/scan-scheduling.ts`; the existing scan processor consumes the extracted timing/predicate helpers.
- Lifecycle and continuity: `src/lib/harbor-console/customer-lifecycle.ts`, `src/app/console/(staff)/customers/[facilityId]/lifecycle/page.tsx`, the existing customer provisioning/billing and staff Implementation actions, and the existing recovery/billing forms.
- Connected handling: the existing ticket timeline, Support actions and automation page; `src/lib/support/history.ts` and `automation.ts` provide exact message/rule anchors.
- Shared presentation/navigation: `src/components/harbor-console/operations-ui.tsx`, Console shell, Today, customer directory/detail, `src/lib/harbor-console/queries.ts`, `presentation.ts`, `administrator-activation.ts`, and `src/lib/route-registry/platform-routes.ts`.
- Documentation: this combined checklist/validation gate and `docs/console/HARBOR_CONSOLE_LIFECYCLE_COMMAND_DECISIONS.md`.

## Combined validation gate

The owner authorized this previously deferred gate, fixes, commit/push and draft review. The following coverage contract has been exercised locally; the [certification](HARBOR_CONSOLE_OPERATIONS_LIFECYCLE_CERTIFICATION_2026-11-19.md) records results, actual fixes and environment-only limitations. No merge or production promotion is authorized.

1. Add/run focused hermetic and route-authorization regressions for all new routes, invalid/repeated query parameters, clamped pagination, role/capability presentation and the unchanged activation wrapper. Cover exact scan eligibility/lease/retry boundaries, existing timing values, no invented delivery SLA, unknown result-code redaction, and revalidation integration.
2. Use disposable PostgreSQL to certify full counts beyond 200 matches, stable pagination and each exact queue predicate, canonical licensing parity, private Facility/vendor Catalog exclusion, no secrets/originals, and Owner-only activation projection. Include empty sets, historical failures followed by success, PENDING/null/SENT/DELIVERED separation, scan-state partition counts, more than ten attempts, unchanged processor claim/retry behavior, stale/deactivated/role-changed/logged-out staff, concurrent logout, customer and mixed-cookie denial, and the over-limit licensing case.
3. Deny customer-data writes at the database, exercise the new readers, and compare before/after snapshots. Confirm the read-only transaction refuses an accidental write and existing assistance/receipt/participant boundaries remain unchanged.
4. Run TypeScript, changed-file lint, the relevant hermetic/SQL suites and production build. Inspect query plans/count-query latency against representative disposable volumes; schema/index changes need their own justified review, not an invented healthy result or an arbitrary global cap.
5. Certify the actual signed-in browser flows: Today → Operations → every handling screen, exact reply/rule anchors, scan filters/pagination → diagnostics → authorized source rescan form, Customers → lifecycle → existing invitation/Support/assigned-engagement/billing flows → refreshed lifecycle, Owner/Member/customer/stale-login behavior, read-only setup/account/licensing facts, no prefetch effects, no service-worker persistence, and independent customer sessions. Recheck the established Phase 3 path as a single workflow.
6. Publish the locally verified batch through a draft PR, run all five required GitHub Verify jobs on its exact head, and separately review protected Preview and release gates. The owner has authorized branch publication; hosted fixtures, migrations, shared configuration changes and production enablement are not authorized by this batch.

Production, hosted databases, shared Preview settings, the assistance pilot, and external activation are outside this batch and remain untouched.
