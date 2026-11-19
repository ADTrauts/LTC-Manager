# Harbor customer lifecycle — selected release scope and future commands

Status: **first-release scope selected by the product owner**: read-only customer lifecycle, retaining existing approved billing, recovery, Support and Implementation handling. The owner accepted this recommendation in the coordinating chat and subsequently authorized combined verification, fixes, commit/push and draft review. Neither instruction authorizes merge, hosted database changes, assistance activation, Production promotion or changes to existing billing enforcement.

The read-only implementation and its deferred evidence are recorded in [the batch checklist](HARBOR_CONSOLE_OPERATIONS_LIFECYCLE_BATCH.md). New manual suspension/reactivation, bulk or full-customer export, and offboarding/deletion commands are **deferred future scope**, not blockers to this selected release. Recommendations below remain unapproved proposals for that future scope; no retention periods or new command authority have been adopted.

## Existing policy and controls

- Billing status and canonical entitlement/installation/Enabled rules already govern customer Department operation. Harbor's existing reconciliation reads Stripe into the local mirror; it does not author Stripe money or arbitrary billing states.
- The current Facility Administrator seat and role periods govern authority. Existing Owner invitation recovery rechecks the seat and requires explicit recipient confirmation; it is not a way to appoint a new Administrator. Existing staff login validation, approved lifecycle step-up and recovery rules, and last-owner protections remain authoritative.
- Staff roles do not grant customer workspace access. Implementation participation and approved Facility assistance are separate boundaries. Nothing in the new status/continuity views enables assistance.
- Facility and vendor ownership remain separate. An Organization relationship is not blanket permission to read, export or delete a vendor's private Department content.
- Logout receipts must remain effective through each signed login's verified expiry plus verifier tolerance independently of audit retention, offboarding, and deletion of linked records.

## Decisions for a future command scope

| Command family | Recommendation for review; not active policy | Exact owner decision still needed |
| --- | --- | --- |
| Manual suspension and reinstatement | Keep canonical billing enforcement unchanged. If a distinct manual lifecycle intervention is needed, require an explicitly authorized designated Owner, the approved action-bound step-up, a recorded reason and exact scope. Make reversal restore only explicitly approved access; it must not clear independent billing, vendor, employment or security restrictions. | Whether a separate manual intervention is needed; permitted triggers; who approves and reverses it; customer notice/grace requirements; exceptions and affected surfaces. No new generic suspension state or override is authorized by this brief. |
| Customer data export | Begin only from a verified request by the current authorized customer representative. Apply the owning domain's scope, include a reviewable manifest, require explicit approval before delivery, and use an approved private delivery channel with expiry. Exclude private vendor-owned content unless its own authorized owner separately approves. Reuse existing export primitives where they actually support the approved scope. | Eligible requesters and approvers; export contents and vendor/Organization boundaries; approved delivery and expiry; required verification and audit evidence. No new full-Facility export or assumed OWNER data access. |
| Offboarding, retention and deletion | Separate reversible access closure from irreversible deletion. Recommend an explicit preservation/hold check and independent approval before destructive work. Preserve domain lineage, required evidence and logout receipts. Require a named recovery point and clear restoration limits before any deletion. | Who requests and independently approves closure/deletion; notice; contractual retention by data owner/type; hold authority; backup treatment; recovery window; and the designated independent approver when only one Owner exists. No contractual duration is inferred. |

These choices apply only if the owner later requests the deferred command scope. They do not block the selected read-only release or call for another onboarding cycle. No command endpoints, inactive action buttons, retention jobs or deletion tools have been added for these proposals.

## Selected release implementation and evidence

The local batch implements read-only customer follow-up through existing account/invitation, Support, Implementation and commercial handling flows. Bounded code inspection identified no further concrete connection missing from that selected scope; runtime correctness remains unverified. Configuration and runtime readiness still need the customer's canonical Builders or a separately authorized scoped assistance workflow; a Harbor metadata view cannot certify them. Provider delivery, scanner/private storage integration, hosted scheduler execution, and real roster/domain/recovery-approver configuration require their existing environment-specific evidence and approvals, separately from the deferred command policy.

Automated verification, browser certification and draft publication are now authorized through the single [combined validation gate](HARBOR_CONSOLE_OPERATIONS_LIFECYCLE_BATCH.md#combined-validation-gate). Hosted database changes, assistance activation, merge and Production promotion remain separately gated.
