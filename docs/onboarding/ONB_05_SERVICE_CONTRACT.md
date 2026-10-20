# ONB-05 implementation service contract

Status: implemented; local phase verification is recorded in the tracker and dated inventory. Production release prerequisites remain open. Authority: accepted phase plan, D09, D13–D14 and the [commercial policy](../product/11_COMMERCIAL_MODEL.md#implementation-service-policy-onb-05-approved-october-18-2026). No ONB-06, rollout or deployment authorization.

## Slice 1 — Engagement and intake

`ImplementationEngagement` records the Facility, requesting customer User, responsible PlatformStaff, support conversation, requested scope and delivery revision. `ImplementationParticipant` is an explicit review grant, checked together with current Facility Administrator or Console authority on every read/action. Console service management requires exiting the Facility work session. Actual configuration/import execution remains in existing canonical Build tools and their work allowlist.

The customer requests AVAILABLE Product scope and deliverables; staff claim/assign responsibility and issue a quote. Scope planning neither licenses nor installs a Department. Existing subscribers can request a later separate engagement. Self-service remains available with no implementation fee.

Source intake writes an actual SupportTicketMessage and its existing private SupportTicketAttachment custody record. Customer authors use their verified session/contact; staff use PlatformStaff, never a User foreign key. A source receipt binds engagement, source revision/message, content checksum and uploading actor. Retrying the same submission/bytes reuses the receipt; a changed file requires a new submission. Files are bounded at 10 MB and retain existing type/safety restrictions. No upload invokes a parser, planner, identity writer or executor. Staff record source-specific mapping/cleanup decisions and unresolved questions, then produce ONB-04 CSV for canonical preview/confirmation. CSV continues to support every advertised ONB-04 dataset; accepting an original `.xlsx` into private custody does not implement an XLSX reader.

Private source reads require explicit engagement participation, current authority, the exact source-message link, matching support ticket/Facility and a CLEAN scan verdict. Original downloads remain staff-only under D15; customer participants see source metadata and shared import receipts, never private support notes or original bytes. Storage keys and file bytes are not in service events or public view props.

**D15 prerequisite:** [canonical support scanning](../architecture/SUPPORT_TICKETS.md#malware-scanning) now has user-approved Option B: a dedicated private ClamAV container behind SupportAttachmentScanner. Local implementation and real ClamAV verification are complete; production hosting, credentials and deployment are separately authorized prerequisites. Private Blob configuration alone does not make PENDING files usable. No fake CLEAN verdict or public scan/upload is permitted. An approved real scan path must be implemented and verified before claiming the original-file service gate. Controlled CLEAN fixtures prove authorization/transport only, not malware scanning.

## Slice 2 — Quote, approval and one-time order

Each `ImplementationOrder` is an immutable quoted revision, with exact Departments, deliverables, digest, USD price, optional complete-order waiver and approving customer User. The price is $1,500 for the first Department plus $500 for each additional Department in this engagement. A later engagement starts the same formula. Product aliases count once. Subscription checkout contains recurring items only, even if ASSISTED is selected as a setup preference; later Department purchases never imply another implementation fee.

Only a live Console Owner can issue a complete-order waiver with a reason. The quote event records the authorizing staff role and scope/order; the customer still explicitly approves it. Neither a waiver nor payment changes subscription access. An already approved scope cannot be edited; later/changed work needs another separately approved engagement. Superseded quotes and stale customer digests fail closed.

`ImplementationPaymentAttempt` persists the exact one-time Checkout request and idempotency key before sending it to Stripe. It uses the canonical Facility billing customer, card payment methods and `mode=payment`; it never creates a subscription. An explicit customer action can configure the canonical billing customer without a subscription or charge. That owner locks/re-reads the Facility and uses a stable Stripe customer-creation key to serialize concurrent callers.

Payment checks, provider calls and local settlement/receipt share the Facility/engagement/order lock. Concurrent requests reuse one active attempt. Recovery retrieves a known session or fully paginates current customer sessions for the stored attempt before any creation replay. The exact request/key may replay only within 12 hours; incomplete/failed reconciliation or older ambiguity cannot authorize a fresh key. Only a positively expired unpaid Checkout without an unsettled PaymentIntent permits a new attempt. Current provider mode, customer, order, attempt, scope digest, amount and currency must match. Customer return, signed webhook replay and Console reconciliation use the same owner. Local settlement and its attributable event commit together; local persistence failure leaves the existing provider payment recoverable without another charge.

Payment states are visible as actual stored attempts, including UNKNOWN. Returning from checkout or canceling a browser tab is not proof of payment/cancellation. Subscription and Department access retain D09, including canceled/unpaid/paused suspension and recovery access.

## Slice 3 — Review, receipts and handoff

Staff record mapping decisions and delivered/deferred evidence for mapping, import review, configuration, training and handoff. These records describe service delivery, not operational readiness, license status or publication. Configuration and customer publication remain with their canonical owners.

Only the original executing actor can explicitly link an ONB-04 batch, from the same Facility and an approved paid/waived scope. Each operation must resolve to a currently operable installed Department in that scope under D09. Linking during an active import lease is blocked. SetupImportBatch/Result ownership is unchanged: ordinary recovery stays exclusive to its executing actor. Service participants receive a narrow read projection of dataset, actor identity, row outcomes and append-only receipt attempts; no raw normalized intent, credential or session snapshot is shared. Unattempted rows are UNKNOWN, and failed/blocked results remain visible. No file-wide rollback is claimed.

Customer acceptance binds the current scope/delivery revision and receipt fingerprint under locks. Every stage must explicitly describe delivered or deferred work. Acceptance stores an immutable reviewed snapshot. Later canonical retries may produce newer receipts; the UI identifies them as outside the prior acceptance, and preserves the accepted evidence. Accepted engagement delivery cannot be silently edited; later service work is a separate engagement.

## Verification and release

See the phase tracker and dated ONB-05 verification inventory for actual commands, counts, failed attempts, controlled provider boundaries and browser evidence. Real local ClamAV scans use synthetic originals and authenticated TLS. Payment-provider tests use a controlled Stripe interface. No live charge, email delivery, live Blob transfer, production scan, deployment or rollout is implied. The accepted proportionate verification policy and mandatory repository/CI gates remain binding.

The normal Git-aware migration integrity prerequisite still applies to ONB-02/03/04 and the two additive ONB-05 migrations. Applying all migrations with matching checksums to an isolated test database does not satisfy their review/tracking gate or certify a customer database.
