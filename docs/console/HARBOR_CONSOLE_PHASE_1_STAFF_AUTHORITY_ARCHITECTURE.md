# Harbor Console Phase 1 staff authority architecture

**Status: initial Marketplace policy approved by the product owner.** The first capability awaits implementation. The rest of the permission matrix and Phase 1B–1D designs remain under review.

## Executive summary

Keep `PlatformStaff` as the Console identity and resolve its permitted operations at the server. A staff role provides a baseline for platform capabilities. Under the Phase 1 target, customer access also requires scope for the target Facility or an explicitly approved domain assignment. Customer role periods, Organization membership, Department authority, and ownership continue to govern customer identities and resources.

The first implementation adds one platform capability for Marketplace publication after this architecture PR is integrated into `main`. Facility assistance is a separate, high-priority security boundary. The publication capability does not implement or certify the Facility grant model.

## Approved initial policy

| Operation | OWNER | MEMBER | Customer Facility identity |
| --- | --- | --- | --- |
| Browse platform Marketplace Records in Harbor | Allowed | Allowed | Outside Harbor staff access |
| Create and edit platform Catalog drafts in Harbor | Allowed | Allowed | Denied |
| Publish platform Catalog Records in Harbor | Allowed with live staff authority and canonical ownership checks | Denied | Denied |

Only `catalog.publish` is authorized for new enforcement in the first implementation. Missing, inactive, or stale staff authority denies publication. Customer Marketplace access through customer workflows remains governed by its own existing rules.

OWNER status grants no automatic Facility access. The approved Phase 1B policy requires a recorded Facility grant for routine assistance by either staff role. The first Phase 1B release will allow only explicitly scoped reads. Emergency access remains disabled pending separate approval.

## Baseline and release status

The integrated baseline is [Phase 0 merge `c502f06a`](https://github.com/ADTrauts/LTC-Manager/commit/c502f06ac5edbb54d19694423bceb8b391e5213a). Local `main` and GitHub `main` matched before the Phase 1A branch was created. Phase 0 verified protected Preview Records with synthetic identities and passed hosted checks. Its production enablement gates remain historical Catalog ownership, scanner and private Blob verification, and production readiness and release approval. [Phase 0 certification](HARBOR_CONSOLE_PHASE_0_CERTIFICATION_2026-11-13.md)

The Git-triggered Vercel build for the exact merge SHA was Ready with a Production target. Vercel listed a generated Git alias that redirected anonymous access to Vercel Authentication. The custom production domains were absent from the candidate's alias list. Current project database variables are separately Production-scoped and their metadata matches the previously recorded Production binding. The candidate's effective runtime database identity and signed-in readiness were outside this read-only check. Production promotion remains a separate release decision. [Release governance](../engineering/LOCAL_DEVELOPMENT_AND_RELEASE.md)

## Current implementation

| Boundary | Existing authority and evidence | Finding |
| --- | --- | --- |
| Platform staff identity | Password sign-in, rate limiting, a distinct Harbor cookie and token use, and live checks for active staff, role, email, and session version. Login writes a Harbor audit event. | Implemented. Account lifecycle is primarily bootstrap/operator-managed. An explicit staff lifecycle and per-session revocation need a design. |
| Console operations | Most operations check active staff. Provisioning and partner administration apply additional OWNER checks. Implementation applies OWNER restrictions to selected decisions. | Implemented with gaps. Some distinct reads and writes share a staff-only decision. A cooperative UI cannot enforce a permission. |
| Facility assistance | Work-session entry and resolution validate staff and the selected Facility. The route policy limits surfaces. The adapter retains a staff actor and supplies a Facility Administrator compatibility role to the app. | Implemented with gaps. Facility relationship, purpose, scope and revocation need authoritative enforcement. Operations using role thresholds and Department ceilings currently depend on the compatibility projection. |
| Customer authority | Context entry revalidates a customer User against internal Facility role periods, Organization membership, or partner access. CDA resolves Department mode and ownership. | Implemented. Reuse these rules for customer authority and resource boundaries. Keep staff assistance outside customer membership and role periods. |
| Implementation | Live actor checks, engagement participant checks, service ownership, and domain events. Private originals also use source and custody checks. | Implemented with gaps. Review Facility-level discovery separately from protected engagement detail. Keep Phase 0 participant and source checks authoritative. |
| Support and Records | Support owns tickets and attachment scanning and custody. Catalog and CDA own Records authorship, visibility, versions, and adoption. | Phase 0 resource checks are in place. Staff operation and Facility-level admission need consistent policy around those checks. |
| Attribution | Harbor start/end, login and selected Console events exist. Implementation, Support and setup imports also retain domain actor facts. | Implemented with gaps. Staff assistance needs durable operation-level outcomes and a stable session reference. Review the lifetime of audit evidence when staff accounts are retired. |

The source trace followed both proxy and application-session resolution. A valid work session takes precedence in the shared app-session reader. The proxy limits path families but the server handlers still derive authority from the session and owning services. Reviewed downstream classes include Facility Builder, Department configuration, workforce management, asset visibility, Records configuration, file access, and setup imports. Some use independent customer or employee relationship checks. Others accept a staff-specific path or the compatibility role, so a matching Facility identifier alone does not establish staff permission. Browser cookie clearing ends the local context. The current work-session design has no durable assistance record for individual server-side termination. These are static findings. This review did not exercise an unauthorized operation against a hosted environment.

The current work-session implementation does not enforce the approved recorded-grant and read-only assistance policy. The path filter and Facility Administrator compatibility role remain part of the current behavior. Phase 1B must close and verify that boundary before the new assistance mode is enabled.

## Authorization and ownership

1. **Identity and platform role.** Resolve live `PlatformStaff` from the canonical Harbor session. OWNER and MEMBER represent organizational standing. Neither role creates customer authority.
2. **Platform capability.** Use one code-reviewed operation registry and a server decision with a small typed action vocabulary. Resolve effective permissions from live identity and approved policy. Keep the first release role-based so policy can be reviewed in Git before adding a grant editor or capability assignments.
3. **Facility scope.** Resolve the Facility from the resource. Check the staff entitlement to that Facility and operation. Limit database queries before projection, counts, search, and pagination. Explicit Support queue or Implementation assignment may supply scoped access only within the owning service and only under approved policy. Platform capabilities and Organization links confer no automatic Facility scope.
4. **Temporary assistance.** Require the workspace entry capability, a Facility scope, and a live assistance record. The request resolves staff, Facility, purpose, expiry and allowed operations. Revalidate on each protected request and at mutation time, including after waiting on a transaction lock. Domain constraints still apply.
5. **Customer authority.** Customer Users and Employees retain their actual roles and relationships. Pass a distinct staff actor into an approved domain command. Enforce Facility and Department ownership, relationship, and feature rules within that command. Explicitly classify each Department write in the canonical write manifest. Keep route and navigation policy as a first filter and derive UI affordances from the server decision.

**Server decision:** live staff identity → capability → Facility scope if applicable → assistance record if applicable → domain authority and resource checks → authorized read or transaction. Unclassified staff operations deny by default when the surface migrates. Cache decisions within a request only. Mutations resolve target scope from canonical rows and recheck before commit. Keep staff and customer session contexts exclusive during assistance. Handle invalid staff assistance explicitly so a stale staff request cannot fall through to customer authority.

| Existing owner | Reuse or extension |
| --- | --- |
| Harbor auth, session, work-session, work payload and proxy | Reuse identity, cookie validation and route discovery. Add staff operation resolution, then replace the compatibility adapter with an explicitly tagged staff context. |
| Platform route registry and existing capability helpers | Reuse code-owned classification and server-side policy conventions. Add Harbor-specific operations to the canonical authorization surface with clear separation from customer timing and workforce capabilities. |
| Context entry, Facility access, Organization membership and CDA resolver | Reuse live role periods, partner scope, Department operator and write decisions for customer authority. Compose resource rules into the staff command. Customer membership tables retain only customer relationships. |
| Implementation authority and source reader | Preserve engagement participants, source authorization, work-session exclusion and transaction rechecks. Apply staff admission before engagement discovery or action. |
| Support service and private attachment reader | Add scope and capability at the owning service boundary. Reuse ticket history, actor fields, scan state and private storage. Keep the Implementation delegation for originals. |
| Canonical Catalog and CDA Catalog ownership | Preserve platform and private ownership, paid/publication boundaries, install authorization and version history. Require an additional staff capability for platform write commands. |
| Facility Builder, Employee Builder and Department services | Reuse domain commands for explicitly approved actions. Preserve CDA write classification and operator bounds with synthetic staff acceptance and denial cases. |
| Billing reconciliation and canonical provisioning | Keep Stripe reconciliation and canonical Organization/Facility bootstrap as owners. Split read, reconciliation and external processor authority. Preserve claim and invitation lifecycle rules. |
| Harbor audit and domain event records | Extend existing evidence and correlate events by request and assistance ID. Support, Implementation and imports retain their domain-owned histories. |

## Proposed permission matrix

The matrix describes the target and identifies the baseline state. The initial approval above covers platform Marketplace browse, draft and publish access plus the starting boundary for future Facility assistance. The other labels and role assignments remain proposals. All entries require live staff identity. “Scoped” means the resource Facility is covered by the relevant grant or an explicitly approved domain relationship. “Read” refers to the domain action and may still emit audit evidence.

| Operation | Platform capability | Facility scope | Additional rule | Mode | Audit evidence | Enforcing owner | Baseline status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Harbor dashboard | `console.view` | Filter Facility data and aggregates | Compose only authorized modules | Read | Login and sensitive view access where applicable | Harbor capability and dashboard loaders | Staff-only shell, aggregate scope gap |
| Customer list and details | `customer.read` | Scoped, including search and pagination | Minimize summary fields | Read | Target Facility, action and outcome for sensitive detail | Customer query/service boundary | Staff gate, scope gap |
| Customer contacts and history | `customer.contact.read` | Scoped, or an explicit Support queue for unlinked contacts | Filter contact history and related Facilities independently | Read | Actor, contact reference and scoped outcome | Support contact/history service | Staff gate, purpose and scope gap |
| Support ticket reads | `support.ticket.read` | Scoped or approved queue/assignment | Separate internal notes and customer delivery | Read | Ticket reference and actor for sensitive access | Support queries and ticket service | Staff gate, per-operation gap |
| Support replies, status and assignment | `support.ticket.manage` | Same ticket scope | Domain workflow, delivery idempotency and actor attribution | Write | Ticket event, actor and delivery outcome | Support ticket and delivery services | Domain events exist, scope gap |
| Support automation and shared templates | `support.settings.manage` | Platform policy for global rules | Explicit settings privilege | Write | Rule/template ID, state change and actor | Support automation and template services | Staff gate, capability gap |
| Attachments | `support.attachment.read` | Ticket/contact scope | CLEAN and integrity checks. Implementation originals also require Implementation authority and participation | Read | File reference, sensitivity class and outcome | Support reader and Implementation source service | Phase 0 checks exist, broader staff scope gap |
| Implementation engagement reads and actions | `implementation.read` or `implementation.manage` | Scoped discovery and engagement Facility | Participant enforcement for protected operations, separate assign and waiver authority, existing work-session exclusion | Read/write | Existing engagement events, actor, Facility and outcome | Implementation authority and service | Partial domain controls, discovery scope gap |
| Marketplace authoring | Staff draft access or OWNER-only `catalog.publish` | Platform only | VSSYL ownership. Retirement and successor creation have separate policy decisions | Write | Definition ID, version, action, actor and outcome | Canonical Catalog service through Harbor authorization | Ownership enforced. Publication capability awaits implementation |
| Private Catalog Records | Customer-owned by default. Any later assisted read needs explicit `facility.records.read` | Scoped assistance | Canonical ownership and CDA conditions. No Marketplace publication or assistance override of private ownership | Read if approved | Record reference, grant, session and outcome | Canonical Catalog and CDA forms | Phase 0 ownership enforced, assistance policy open |
| Provisioning, partner invitations and claims | `provision.facility`, `partner.invite`, `organization.claim.review` | Approved new target, or existing Organization/Facility scope | Invite recipient and replay guard. Explicit approval for first-admin decisions | Write | Target creation/claim/invite, actor, status and delivery receipt | Canonical provisioning and invitation/claim services | Mixed OWNER and staff gates |
| Billing diagnostics | `billing.read` | Scoped | Redacted provider status and references | Read | Sensitive view, Facility and actor | Harbor diagnostics and Billing readers | Staff gate, scope gap |
| Billing reconciliation | `billing.reconcile` | Scoped | Canonical Stripe-to-local sync. Processor mutations require separately approved authority | Write | Facility, provider reference, result and actor | Billing reconciliation service | Staff gate and telemetry, no dedicated staff capability |
| Facility workspace entry and exit | `facility.assist.enter` | Explicit active scope | Reason, allowed operations, expiry, current staff session binding | Write assistance state | Grant/session references, reason, start/end/expiry and outcome | Harbor work-session and canonical session validation | Compatibility session, durable grant/session missing |
| Facility Builder | `facility.structure.read` or `facility.structure.write` | Scoped assistance | Same-Facility resource and domain invariant checks | Read/write | Resource, action, safe change summary and staff session | Facility Builder actions and owning services | Compatible role and Facility scoping, staff action scope gap |
| Employees and Department configuration | `facility.workforce.read`, `facility.department.read` or specifically approved write capability | Scoped assistance and Department bounds where applicable | CDA, operator period and domain constraints. Customer authority transfer, HR separation and credentials require separate policy | Read/write | Staff, Facility, Department, resource, reason and outcome | Employee and Department services, CDA manifest | Mixed guards. Individual action migration required |
| Staff administration | `staff.lifecycle.manage` or `staff.grant.manage` | Platform, plus grant target scope | Step-up, separation of duties, last-owner protection and session revocation | Write | Actor and target staff, old/new authority, reason and revocation outcome | Harbor identity and lifecycle service | Bootstrap/operator-managed |
| Audit history | `staff.audit.read` | Scope to authorized history; explicitly privileged cross-Facility review | Redact sensitive values, minimize exports | Read | Access/export actor, scope and reason | Harbor audit and domain history projections | Partial events, no unified scoped review |
| Security-sensitive settings | `security.settings.manage` for approved operations only | Explicit environment and target | Step-up, approval where required, no implicit grant from assistance | Write | Change reference, approver, scope and outcome | Existing platform governance and owning configuration service | Operator-owned, staff policy open |

## Facility access and accountability

Routine assistance under Phase 1B will require a recorded, narrowly scoped Facility grant, including for OWNER. Record the approver, permitted read operations, purpose, start, expiry and revocation. Approval, renewal, revocation, and the initial read list remain Phase 1B decisions.

Emergency access is disabled. A later proposal would require separate review of its scope, reauthentication, incident reference, server-enforced expiry, reviewer notification and post-use review.

If a persistence change is approved, Harbor owns two narrow records. A **staff Facility grant** stores approved staff-to-Facility scope, allowed operations, approver, effective dates and revocation. Retain closed records as evidence. An **assistance session** binds one staff identity and staff login to one live grant and Facility, records purpose and allowed operation subset, and ends at logout, explicit exit, revocation or expiry. The work cookie should reference that server record. Assistance end or grant revocation takes effect on the next authorization decision. Serialize high-risk writes with authority changes so a write cannot commit after a revocation that wins the lock. Customer roles, Department authority, content ownership, staff employment and operational data remain with their existing owners. Derive roles and capabilities from the approved policy and live facts. Use forward-only migrations.

Capture the actual principal kind and stable staff ID, operation, target Facility and resource, role/capability decision, grant/session reference, purpose, outcome, timestamp and correlation ID. Record a redacted changed-field summary or domain event reference for a write. Store durable attribution in the same transaction when the mutation commits. Provider side effects need idempotent intent and outcome evidence in their existing owner. Retain separate evidence for denied high-risk actions without leaking object existence. Keep request contents, tokens, credentials, arbitrary free-text payloads and private originals out of audit logs. Preserve staff history through deactivation and decide retention and deletion policy before expanding attribution.

## Verification and certification

Use synthetic staff, customer Facility Administrators, Department staff, a partner, and at least two Facilities in disposable PostgreSQL. Exercise the platform resolver with hermetic tests, real domain services and persistence with SQL tests, then the normal authenticated paths in a protected Preview. Verify Server Actions and API handlers directly using legitimate test identities. A denied action must leave target state unchanged and disclose no private fields. Record the exact revision, tests executed, and skipped checks.

| Scenario | Required evidence |
| --- | --- |
| OWNER, MEMBER and customer | Approved OWNER permits the classified operation. MEMBER and customer are denied when policy excludes them. Permitted reads, customer operations and staff without that capability retain their intended behavior. |
| Facility scope and cross-Facility isolation | Scoped staff can read only the intended Facility and permitted child resources. Foreign filters, detail, attachment, mutations and aggregate counts do not reveal foreign data. |
| Assistance lifecycle | An active grant starts a session with recorded purpose. Missing, revoked, expired or foreign grants deny entry. Explicit end and logout invalidate server use, including old session references and another tab. A stale staff context cannot authorize a customer write. |
| Direct requests | Test the handler and owning service for wrong principal, missing capability and wrong Facility without relying on navigation. Verify route classification for every admitted operation. |
| Employment and account changes | Deactivation, role changes, session-version changes and credential recovery invalidate affected authority. A revocation or expiry while a write waits must deny the write. |
| Mutation attribution | Authorized assistance writes record the real staff actor and context with the committed change. Failed writes do not record a successful outcome. Verify no customer identity is attributed and no secrets reach logs. |
| Phase 0 regression | Participant-only originals retain scan, checksum, source, and cross-engagement denials on both entry paths. Catalog browse, detail, version, ownership, handover and install restrictions hold with the rollout flag on and off as applicable. Preserve ordinary Support and legitimate customer workflows. |

## Work packages and gates

**1A — Staff capabilities.** Implement the approved OWNER-only publication rule after the architecture document is integrated into `main`. Extend Harbor authorization and the Catalog server boundary using code-owned rules with no schema change. Classify further platform actions only after separate policy review. Verify live authority, denied direct requests and draft integrity, and preserve Phase 0 private Catalog enforcement. Acceptance requires server-side proof for both publication actions and regression coverage for authorized staff.

**1B — Facility-scoped assistance.** Design recorded Facility grants and revocable, read-only assistance using Harbor work/session and the domain services. Choose who can approve grants and which reads are admitted. Keep emergency access disabled. Proposed forward migrations are limited to the approved grant/session records and required references. Requires the 1A capability resolver and an approved scope policy. Any later assisted write requires separate approval and minimum 1D evidence. Verify two-Facility isolation, cookie precedence, expiry and revocation, including concurrent requests and prior legitimate customer behavior. Acceptance requires no surviving path from an assistance context to a customer-role-only authorization.

**1C — Staff authentication and lifecycle.** Reuse `PlatformStaff`, Harbor login and session validation, rate limiting, and canonical revocation patterns. Add approved invite, activation, credential recovery, role-change, deactivate and last-owner policies. Confirm staff employment source, MFA/step-up approach and bootstrap recovery. Schema changes are optional until the chosen lifecycle and per-login revocation need durable facts. Requires 1A staff policy and coordination with 1B session invalidation. Verify stale tokens, failed auth, revocation and cross-identity isolation. Acceptance requires a documented end-to-end lifecycle with tested fail-closed behavior.

**1D — Action attribution and audit history.** Extend Harbor audit and domain evidence with actor, target, grant/session reference and outcomes. Add forward columns or references only where current events cannot represent those facts. Coordinate the audit contract before 1B mutating operations. Verify rollback, outbox or provider retry, audit retention, denied action evidence and scoped audit read access. Acceptance requires tracing every newly authorized assisted mutation to the actual staff identity without exposing secrets.

| Package | Expected source and test areas |
| --- | --- |
| 1A | `src/lib/harbor-console/` for live staff and capability resolution, Console Catalog actions and canonical publication, then the approved Console loaders and commands. Add hermetic decision tests and disposable database publication tests. |
| 1B | `src/app/api/console/work-session/`, Harbor work payload/session and proxy, shared app-session resolution, Facility Builder and CDA write manifest, and Prisma grant/session persistence if approved. Add SQL isolation and concurrency tests and protected Preview session coverage. |
| 1C | `src/app/api/console/auth/`, Harbor auth and session, canonical revocation and existing staff bootstrap. Add lifecycle service and any approved Prisma migration. Add identity, recovery and session invalidation tests. |
| 1D | `HarborAuditEvent`, domain transactions in Support, Implementation, Facility and Billing, and the authorized history reader. Add transaction, delivery/retry and redaction tests. |

For each package, **PASS** means its acceptance cases, server authorization, regression checks and required review all pass. **PASS WITH GAPS** means a documented evidence limitation outside the enabled boundary has an owner and a closure gate. **FAIL** means an authorization, isolation, revocation or attribution test fails, or a required boundary is unexercised without a verified fail-closed disposition. Package certification never substitutes for production enablement approval.

## Remaining decisions and first implementation PR

1. Review additional Phase 1A role assignments, including retirement and successor creation, before changing those operations.
2. For Phase 1B, decide who approves and revokes Facility grants, the permitted read operations, grant and session expiry and renewal, and whether ticket or engagement assignments may convey separate domain access. Any emergency access or assisted write requires fresh approval, including the applicable customer consent.
3. For Phase 1C, decide staff employment and deactivation ownership, MFA and step-up, bootstrap recovery, last-owner handling, and individual session revocation.
4. For Phase 1D, decide who may review evidence, retention and redaction rules, and the evidence required before any later assisted write.

After this PR is integrated into `main`, a separate implementation PR will add **one server-enforced `catalog.publish` capability**. Use live Harbor staff validation and canonical platform Catalog publication. Apply the OWNER-only check to both publication paths, before any draft write in combined save-and-publish. Preserve MEMBER browse and draft editing and use the same decision for UI affordances. Test direct actions, inactive and stale sessions, unchanged draft data on denial, private Catalog ownership, and existing published history. Keep retirement and successor creation under their existing authorization until separately reviewed.
