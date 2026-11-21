# Phase 5 customer offboarding — approved request and review workflow

Status: implementation draft, November 20, 2026. The owner approved the recommended request/review scope with no tests, scanning/staff invitations/independent recovery disabled, and no merge or promotion without approval. A hosted migration, enablement and release remain separately approved steps. No service closure, billing cancellation, access removal, automatic notice or deletion is part of this implementation.

## Approved implementation

The current, normally signed-in Facility Administrator requests an offboarding review for the active Facility. The request records the requested target date and a customer-visible reason. Only the Vssyl OWNER reviews and publishes the plan. Ordinary Harbor Members, Organization membership, vendor participation and staff assistance do not confer this authority.

The OWNER records a customer-visible plan for billing, existing limited Record exports, access and preservation follow-through. The Administrator can acknowledge the exact published plan or withdraw the request. Editing the plan requires fresh acknowledgment. The target date is a planning date, not a scheduled access cutoff or automatic promise about billing. Request states describe coordination, not whether the Facility is actually closed.

Each mutation rechecks live authority and current Administrator seat under transaction locks. Audit events record actual actor, request, revision and the reviewed plan. Exact command retries reuse the original receipt; conflicting reference reuse and stale plans fail. A successor Administrator must submit a fresh request rather than inherit the predecessor's acknowledgment. The OWNER can resolve a stale predecessor request without authorizing any service change.

Customer Administration and OWNER Console screens show the request and its shared plan. Only authorized current requesters see their customer-side requests; the OWNER can review the queue and history. All free text is customer-visible, with instructions to exclude private HR, credentials and vendor/internal notes. Lists and history are bounded and paginated. Opening a page performs no writes or provider calls.

## Existing owners and integrations

| Need | Existing owner to reuse | Offboarding boundary |
| --- | --- | --- |
| Active representative | Facility Administrator seat and UserFacilityAccess role periods | Revalidate the actual current seat; no Organization-wide or staff authority substitution. |
| Operational pause | Facility.operationsSuspendedAt and the OWNER suspension command | Link to the existing deliberate command; a planning status must not shadow or change the pause. |
| Billing | Facility billing mirror, existing Stripe reconciliation and customer billing surface | Read local facts and link to existing handling. No provider cancellation, refund, payment or new billing state. |
| Customer reports | CustomerRecordExportRequest and its existing authorization/download path | Preserve the approved limited self-operated scope, requester-only download and 24-hour approval. No full backup or staff report download. |
| Support | Existing Facility Support handling | Link to existing customer/staff surfaces; create no automatic ticket or message. |
| Identity and evidence | Existing login revocation, domain attribution and logout receipts | No account closure, token revocation or retention change from a planning action. |

The request owns governance coordination only. It must not duplicate entitlements, operational status, export permissions or vendor ownership. It introduces no generic case engine, scheduler or background job. A forward migration for request/audit metadata would be prepared locally and require separate hosted approval. Governance writes should remain usable while operations are paused.

## Deferred execution decisions

Automatic closure would need explicit choices for effective cutoff/timezone, customer notice/grace, contractual cancellation/charges, export availability after closure, retained access, preservation/holds, vendor-owned data, retention/backup treatment, restoration and who can approve each action. No default contractual duration, automatic cancellation or access closure is inferred.

Irreversible deletion remains separate even if automatic closure is later approved. No purge, deletion command, retention timer or destruction of logout receipts is part of the recommended first implementation. Existing data remains subject to its current owning rules.

## Persistence and release boundary

`CustomerOffboardingRequest` owns only the immutable original request and the latest shared plan/revision. `CustomerOffboardingEvent` owns append-only command receipts, original actor IDs/labels, the action/revision and each published plan. Plan review marks are attestations of review, not independent proof that an external action occurred. Existing billing, suspension, export and access facts remain in their owning stores and are composed afresh on detail views.

The forward migration `20261120190000_customer_offboarding_review` adds these two governance tables, request scope/transition constraints, an append-only receipt guard, a unique open-request index per Facility and a deferred matching-revision receipt trigger. It changes no existing customer rows, billing, access, operational guards or logout receipt protections. New relations use restrictive deletion behavior. This is not an adoption of a contractual retention duration or an automatic purge policy.

States are REQUESTED, PLAN_READY, ACKNOWLEDGED, WITHDRAWN and DECLINED. The first three are open coordination states. There is no CLOSED, CANCELLED_SUBSCRIPTION, ACCESS_REMOVED or DELETED service state. A new plan increments its version and returns to PLAN_READY, requiring fresh acknowledgment. Terminal requests do not reopen. An OWNER may decline a stale predecessor request so the current Administrator can make a fresh request; no acknowledgment or report permission transfers to the successor.

Request creation and commands serialize their UUID references, current actor authority, Facility, relevant User/access and request rows before validating the revision and writing state plus receipt. Matching retries return the original receipt before another transition; conflicting reference reuse fails. Reads use read-only RepeatableRead snapshots and then revalidate live authority outside the snapshot. Lists and history use stable 25-row pages with total counts. Stored plan data must pass the same schema before customer acknowledgment. Dates are validated with the existing Operational Time civil-date helpers; the request records the Facility timezone at submission for stable plan labeling, with no scheduled cutoff instant.

Routes: customer `/admin/offboarding` and `/admin/offboarding/[requestId]`; OWNER `/console/offboarding` and `/console/offboarding/[requestId]`. All service reads/writes and page entry points are guarded by `CUSTOMER_OFFBOARDING_ENABLED`, default false. Navigation is hidden while disabled. This permits compilation/release preparation without querying new tables on an unmigrated hosted environment. Activation requires the approved migration first. Do not set the gate on an unmigrated target or change shared Preview/pilot settings as a convenience.

The Department write manifest classifies the three server actions as governance. The pause preflight allows these governance routes so planning remains available during operational suspension. It does not grant an operational write exception. Neither the services nor their actions call Stripe, email/push senders, operational-pause commands, export permission/download functions, account deactivation or delete operations. Source facts are labeled as current local metadata, and follow-through links keep the original authorization boundaries.

Prisma client generation and TypeScript/Preview compilation are preparation evidence only. **No tests, app/browser smoke, fixtures, health probes, messages, manual jobs or hosted database writes.** The SQL triggers, race behavior and runtime journeys remain unverified. Publication uses `[skip ci]` and no commit hooks; skipped required checks are not reported as passing. Repository rules are unchanged.

The next release decision is a durable recovery copy and this one forward migration on synthetic staging `br-aged-river-b8b7c2a1`. Production schema, offboarding activation, merge and promotion need their own exact-target approvals. Retain the compatible previous deployment and database recovery resources; preserve logout receipts through their existing expiry-based deadlines. Scanning, staff invitations, independent recovery and assistance/grant issuance remain disabled; the released push and shared schedules are unchanged.
