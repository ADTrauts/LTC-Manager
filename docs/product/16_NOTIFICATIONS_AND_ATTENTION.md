# 16 — Notifications & Attention

**Status:** Accepted architecture. N0 complete. N1 foundation certified. N2 in-app Attention Center implemented. N3A enables `assignment.changed`. Coverage state transitions are live from Assignment writes and plan confirmation. The Coverage time evaluator and the Key Point overdue evaluator are implemented. The production scheduler is blocked until the host accepts a sub-hour cron. Phase 0 verified `/api/internal/scheduled-evaluation` is **not** listed in committed `vercel.json` (only daily Support and Plant PM crons). `work_order.assigned` is live from the Work Order write. The `work_order.overdue` evaluator is implemented. The production clock is inactive. The other trigger-matrix rows stay unwired. Not production-ready: no push, no email, and no presentation grouping. Snooze, quiet, and digest eligibility are stored and do not yet change a visible channel. Temporal foundation constraints for later phases: [01B](./01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md#amendment-g--temporal-foundation).  
**Decision:** Product owner, October 29, 2026. This adds a platform engine. It changes no release status, price, or sellability.  
**Layer:** Platform. Cross-cutting. One engine for every Department.  
**Plug-in contract:** [Foundation amendment — October 29, 2026](./01_PRODUCT_CONSTITUTION.md#foundation-amendment--october-29-2026).

Notifications are the platform's attention-delivery system. They do not own operational truth.

---

## What this engine owns

The engine decides, from facts another domain already recorded:

1. Whether a person should hear about the change.
2. How much attention that change warrants.
3. Who should receive it, and why.
4. How it is delivered.
5. Whether acknowledgement or escalation is required.
6. When the existing attention thread should update or close.

It persists the attention thread, the recipient's read / acknowledgement / snooze state, and delivery attempts. Those rows are delivery records. They are not a second Coverage answer, Readiness answer, Record, Asset condition, Issue, or Work Order.

Authoritative domains keep their facts:

| Fact | Owner |
|------|--------|
| Whether a responsibility is Covered, At Risk, or Uncovered | Coverage |
| Whether a place is Ready, In Progress, or Needs Attention | Readiness / Runtime Location State |
| Whether a required Record passed, failed, or needs corrective action | Records |
| Whether a Key Point occurred on time or late | Operational Cycle (`OperationalCycleKeyPointActual`) |
| Equipment state | Asset lifecycle and condition |
| Maintenance response | Issue and Work Order |
| Whether the operation has recovered | The domain that owns the disrupted fact |
| Conversations and messages | Chat, when that domain is built |

A notification observes a transition. It does not become the transition.

---

## Placement

```text
DOMAIN ENGINES
  Assignments, Coverage, Operational Cycles, Key Points, Readiness,
  Records, Corrective action, Issues, Assets, Work Orders, Recovery

COMMUNICATION DOMAIN (future)
  Conversations, participants, messages, mentions, replies, read state

CROSS-CUTTING PLATFORM
  Identity, Authorization, Audit, Time, Offline / Sync,
  Notifications & Attention
    Event intake
    Attention policy
    Recipient resolution
    Priority
    Grouping and deduplication
    Acknowledgement, snooze, escalation
    Preferences
    Delivery: in-app, web / PWA push, email, later channels
```

Dietary, Environmental Services, Facility Plant Operations, and later Departments configure policy. They do not receive a notification engine of their own.

Dashboard Attention stays a composition. Mappers in `src/lib/dashboard/attention.ts` turn current module output into `DashboardAttentionItem` for the supervisor home. That composition persists nothing. Its severity scale is `act_now`, `due_soon`, and `watch`. Notification priority is a different scale, defined below. A Dashboard card does not write a Notification row, and a Notification row is not the Dashboard's source of truth.

Harbor support notices to Vssyl Console staff are a Console support workflow. They are not this engine. Customer operations do not publish through them.

---

## Kinds

Every notification has one kind.

| Kind | Produced by | Lifecycle |
|------|-------------|-----------|
| **Operational** | A real operating condition | May require acknowledgement, escalation, and resolution from the owning domain |
| **Communication** | A person: direct message, mention, reply, conversation activity | Unread and read. Ordinary messages do not use operational acknowledgement or resolution |
| **System** | A technical or account condition: sync conflict, import failure, integration failure, configuration activation failure | Acknowledgement when a person must intervene. The system domain confirms resolution |
| **Admin** | Governance or Build workflow: approval waiting, publication completed or failed, access change, administrative request | In-app, often email. Facility Administrator and the person who owns the configuration |

---

## Three different scales

Operational condition, notification priority, and delivery interruption are three facts.

**Operational condition** is the owning domain's word. Coverage uses Covered, At Risk, Uncovered, Not Yet Assigned, Not Confirmed, and Not Applicable. Readiness uses Ready, In Progress, and Needs Attention. Asset condition uses its own registry words, including degraded and out of service. A Work Order has its own lifecycle. The notification engine does not rename these.

**Notification priority** is how much human attention the policy requests. The words are Update, Needs Attention, Urgent, and Critical. Priority comes from the policy evaluating the domain's facts. It is not inferred from the wording of a message.

**Delivery interruption** is how strongly a channel interrupts the person: stored in the Notification Center, an attention badge, a push, or an email. The delivery policy reads the priority, the control level, and the preferences that are allowed to apply. A push provider accepting a message does not mean the person read it or acted.

Readiness already uses **Needs Attention** for the place answer (internal `blocked`). Notification priority also uses **Needs Attention**. In copy, name the owner: "Readiness is Needs Attention" is the place. "Priority is Needs Attention" is the notification. The two sentences may be true together. They are not the same stored fact.

The policy event names `readiness.became_at_risk` and `readiness.became_degraded` are attention-policy names. They do not add readiness states called At Risk or Degraded.

| Policy event | Readiness fact that emits it |
|--------------|------------------------------|
| `readiness.became_at_risk` | Readiness is Needs Attention, and the operation is still outside the urgent horizon configured for that Department |
| `readiness.became_degraded` | Readiness is Needs Attention inside that horizon, or the condition is already blocking the active operation |
| `readiness.restored` | Readiness returned to Ready |

Priority on that thread may still rise from Needs Attention to Urgent to Critical as time passes, without a new readiness word.

---

## Priority

| Priority | Meaning | Typical delivery |
|----------|---------|------------------|
| **Update** | Useful, and no immediate action | Notification Center. No operational attention badge. No push. No escalation |
| **Needs Attention** | A person should review or address it | Notification Center. An attention badge when the kind is operational. Push only when policy allows. Acknowledgement when the policy requires it. Limited escalation |
| **Urgent** | Time-sensitive operational intervention | Persistent attention, a prominent badge, push, acknowledgement, escalation |
| **Critical** | Rare. Safety, regulatory exposure, or major service continuity | Persistent attention, immediate push, acknowledgement, active escalation. Protected |

Critical stays rare. A critical Asset does not make every related Work Order Critical. Role does not set priority. The event and the policy set priority. Role helps decide who receives it.

The policy evaluates operational impact, time sensitivity, whether a person must act, scope, persistence, and whether an escalation condition is already met. The source domain supplies the facts. The policy names the priority. The delivery layer names the interruption.

### Dynamic priority

Priority may rise as a condition persists or a deadline approaches. The result is one attention thread, updated in place.

Example, Food and Nutrition breakfast coverage for one location:

| Moment | Domain fact | Priority on the same thread |
|--------|-------------|-----------------------------|
| 7:05 | Coverage becomes At Risk | Needs Attention |
| 7:25 | Still unresolved, and breakfast is soon | Urgent |
| 7:45 | Meal service has started and required coverage is still missing | Critical |

Initial typed policy for `coverage.became_uncovered`, until a published Department policy replaces the numbers:

| Distance from the active service | Priority |
|----------------------------------|----------|
| More than 120 minutes before | Needs Attention |
| 31 to 120 minutes before, including exactly 120 | Needs Attention |
| Within 30 minutes | Urgent |
| Active service has started | Critical |

The middle band is Needs Attention. Urgent starts at 30 minutes before service. This is the N1 code policy, `notifications-n1b-v1`. A later published Department policy may replace the numbers. It does not make that band Urgent unless this section is amended.

Other domains use their own thresholds. The explanation stored with the thread must be able to answer "why is this Urgent?" with the facts the policy used: the condition, the time remaining, and the recipient reason.

---

## Lifecycle

Operational recipient state keeps these facts apart.

| Fact | Meaning |
|------|---------|
| **Read** | The recipient has viewed the notification |
| **Acknowledged** | The recipient has accepted responsibility for addressing the condition. Acknowledgement can stop escalation. The underlying condition can still be open |
| **Snoozed** | The recipient has suppressed repeat interruption for this condition until a time. A material rise in priority may break the snooze |
| **Escalated** | The Department head was added because no primary-responsibility recipient had acknowledged by the deadline. The deadline passing, by itself, is not Escalated. Escalation does not raise priority |
| **Resolved** | The owning domain has confirmed the condition recovered |
| **Expired** | Attention is no longer actionable because the operational window ended or the requirement ceased. The condition did not recover. The bell treats `expiresAt` as inactive. History shows Ended |

Read is not acknowledgement. Acknowledgement is not resolution.

Communication notifications use read. Their acknowledgement, snooze-as-escalation-stop, and operational resolution fields stay empty.

### Resolution comes from the owning domain

Completing a task is not, by itself, operational resolution.

| What a person finished | What resolves the attention thread |
|------------------------|------------------------------------|
| A Work Order marked complete | The Asset domain, when the asset is back in service, for an out-of-service thread. The Work Order domain, when the intervention thread was only "someone must take this order" |
| An EVS cleaning task marked complete | The readiness or inspection domain that owns "room ready" or "inspection passed" |
| An employee reassigned | Coverage, when the derivation says Covered |
| A corrective action closed | The Records domain, when that corrective action is no longer overdue or required. Closing it does not turn a failed Record into a pass |
| A chat message that says the work is done | Nothing operational. The person completes the authoritative action |

The usual operational path is: the domain records the condition, the engine opens or updates one thread, a person reads and acknowledges, the domain later records recovery, and the engine resolves the thread.

When the condition ends without recovery, the domain emits `attention.expired`. The engine sets `expiresAt` and leaves `resolvedAt` empty. Recipient read and acknowledgement stay as they were. The Attention Center shows Ended, not Resolved.

Scheduled Evaluation is the platform clock. It invokes a typed domain evaluator. It does not decide Coverage, overdue rules, or priority. Registered evaluators, in run order, are `coverage.time-boundaries`, `key-points.overdue`, `work-orders.overdue`, `notifications.responsibility-reconciliation`, `notifications.escalation`, and `notifications.external-delivery`. Responsibility reconciliation adds the person who holds an open thread's primary duty at the evaluator's current time. It does not change priority. Acknowledgement escalation runs after that reconciliation in the same pass. It adds the Department head and does not raise priority. Coverage rederives open episodes in facility-local time, records a real Coverage transition when the answer changed, asks policy to reevaluate priority when only the clock crossed 30 minutes or service start, and expires attention when the service window or the requirement ends. Key Point overdue asks whether a REQUIRED location-grain Key Point has passed its expected facility-local minute with no `OperationalCycleKeyPointActual`. The catalog event id remains `milestone.overdue`. The product word is Key Point. NONE and OPTIONAL are not overdue. Department-grain Key Points are not evaluated. The target cadence is five minutes. Production does not invoke the clock yet. Work Order overdue asks whether an open Work Order is at or past `dueAt`. `targetDate` is not that deadline. Preventive Maintenance occurrence lateness stays on the occurrence. Corrective-action overdue is deferred: a Record does not own an open due response. Handoff is not registered. `work_order.assigned` is not a scheduled evaluator. The internal route is `/api/internal/scheduled-evaluation` and requires `CRON_SECRET`. It is not listed in `vercel.json`. The current project cron file is daily, and a daily job cannot see these boundaries. Preventive maintenance and support automation stay on their own daily jobs.

---

## Department Builder

Department Builder gains a **Notifications & Attention** section. It defines how that Department uses the shared engine. It does not send push, email, or in-app delivery.

The section holds:

- Event policies, chosen from the platform event catalog
- Importance thresholds and timing tolerances
- Protected notifications
- Recipient responsibility
- Escalation rules
- Grouping defaults
- Department presets

Notification policy is Build configuration. It follows draft, review, and publication. Run uses the policy effective for that service date. A draft does not change today's attention. Publishing a policy does not rewrite attention history.

Facility leadership may set a facility policy that establishes minimums. A Department policy may be stricter. It may not weaken a protected platform or facility minimum.

### How the same engine differs by Department

Presets are examples for the first policies. They are not separate engines.

**Food and Nutrition.** Call-off affecting today's service. Coverage At Risk. Coverage Uncovered. Assignment changes on the active service day. Readiness Needs Attention. Servery Ready overdue. Meal Service Started overdue. Critical temperature or other critical evidence failure. Corrective action overdue. An equipment issue with operational impact.

**Environmental Services.** Cleaning assignment changed. Discharge clean requested or overdue. Isolation clean required or overdue. Inspection failed. High-touch task missed. Supply shortage affecting work. Room awaiting verification. Area readiness Needs Attention.

**Facility Plant Operations.** Asset out of service. Asset failure with operational impact. Work Order assigned. Emergency Work Order created. Work Order overdue. Preventive maintenance overdue. Inspection failed. Utility interruption. Vendor response received. Recovery confirmation required.

A later Department adds presets in its blueprint. It reuses this engine.

---

## Control levels

Each policy has one control level.

| Level | Who decides | What stays fixed |
|-------|-------------|------------------|
| **Protected** | The platform, and facility policy where the platform allows a minimum | The person cannot turn the in-app attention off. External channels may still be configurable |
| **Facility controlled** | Facility leadership, inside Department Builder publication | Whether the condition notifies, the threshold, and the minimum priority |
| **User preference** | The person, inside the floor the control level leaves open | Channel and minimum priority for that category |

Protected conditions include: active service materially late, a critical evidence or safety failure, active required coverage Uncovered, critical operational degradation, and an unresolved critical corrective action.

Facility-controlled examples include: preventive maintenance overdue, a routine Work Order overdue, a discharge clean approaching its threshold, and readiness risk beyond a configured horizon.

User-preference examples include: routine assignment updates, Work Order comments, low-priority asset updates, Chat messages, mentions and replies, and noncritical administrative updates.

Where a category mixes trivial and urgent activity, the control is a minimum priority, not a single on/off switch.

```text
Work Order notifications
  Everything
  Needs Attention or higher
  Urgent or higher
  Critical only
  Off
```

A protected minimum removes the choices that would hide the required attention. "Off" is absent when the category is protected.

### Precedence

```text
Platform protected policy
        ↓
Facility policy
        ↓
Department policy
        ↓
Role default
        ↓
User preference
```

A lower layer may personalize a channel or raise sensitivity. It cannot weaken a protected requirement above it.

Quiet hours and off-duty behavior may delay Update and Needs Attention interruption. They do not drop Urgent or Critical protected attention.

### Role defaults

A facility does not start from a blank preference form for every employee. The platform ships role defaults. The person inherits them and may change only what the control level allows.

| Role | Default intake |
|------|----------------|
| **Frontline** | Personal assignment changes, work assigned to them, corrective action they own, an urgent condition at the location of their current work, direct messages and mentions |
| **Supervisor** | Call-offs, coverage risk, uncovered responsibility, readiness changes, service delays, critical evidence, operational issues, degraded assets, corrective action, handoff, sync conflicts that need a person |
| **Department Manager** | Escalated unresolved conditions, sustained Critical conditions, department-wide issues, approvals, digests. Not every supervisor alert |
| **Facility Administrator** | Configuration, access, publication, administrative, and system or governance conditions |

Severity still belongs to the event.

---

## Recipients

The engine resolves recipients from operational context. Domain code does not call a department-specific notify function. It publishes an event. The engine runs the equivalent of `resolveResponsibleRecipients(event)`.

Resolution may use facility, Department, role and authority, on-duty state, the current Assignment, location responsibility, the Operational Cycle, work ownership, asset ownership, on-call responsibility, and the escalation policy.

Recipient reasons:

| Reason | Meaning |
|--------|---------|
| `CURRENT_ASSIGNEE` | The person assigned to this work or this place today |
| `ON_DUTY_SUPERVISOR` | The Employee on the supervisor-rounding Assignment for this Department, location, and time. Notifications deliver that Employee's User when facility and Department access allow it |
| `DEPARTMENT_MANAGER` | The Department head, usually as an escalation target |
| `ASSET_OWNER` | Unavailable. The maintainer is an organization, not a person. Resolution returns `asset_owner_is_organization` |
| `WORK_ORDER_ASSIGNEE` | The person assigned on the Work Order |
| `ON_CALL_RESPONDER` | Ready. The Employee on the On-Call Coverage Assignment for this Department, location, and time. Notifications deliver that Employee's User when facility and Department access allow it. An Employee with no User is not replaced |
| `ESCALATION_TARGET` | The next person in the published escalation rule |
| `FACILITY_ADMIN` | The Facility Administrator, for governance and publication |

Each delivery can explain why the person received it. Example: "You received this because you are the on-duty supervisor responsible for this location."

Authorization still applies. The resolver does not notify a person the server would refuse to show the underlying fact. No cross-facility recipient.

Vendor-run Departments follow the contracted-department rule. The operating partner's people receive the operational thread. The Facility Administrator receives the summary and compliance path they already have, not the partner's floor alerts, unless they are the Department head.

---

## Escalation

V1 escalation is live. An active operational thread that requires acknowledgement and is escalation-eligible adds the Department head when no recipient holding the thread's primary responsibility reason has acknowledged by the thread's escalation deadline.

The deadline is `Notification.createdAt` plus fifteen minutes (`ATTENTION_ESCALATION_DELAY_MS`). No certified duration existed. Fifteen minutes is longer than the five-minute evaluation cadence, so a thread is not escalated on the tick that opened it, and shorter than a meal service, so an unacknowledged condition still reaches the Department head during that service. Every priority uses this same window. Coverage's 30-minute band remains a priority clock. The deadline is frozen in `escalationDueAt` with `escalationPolicyVersion` `notifications-n4c-v1`. Priority rise, duty change, a new recipient, and a later change to the constant do not move it. A thread that becomes eligible later uses the original `createdAt`, not the evaluator's now.

`escalatedAt` means the Department head was added. It does not mean the deadline passed. A missing Department, a missing head, or a head with no authorized User adds nobody and leaves `escalatedAt` empty so a later pass can retry. One tier only. A later change of Department head does not replace that recipient. Resolved and Ended cancel the mutation and keep a deadline that was already stored. Any historical primary-responsibility acknowledgement still counts after duty turnover. A Department Manager acknowledgement does not. Read does not.

Escalation does not raise Notification priority, change protected status, or change the source condition. Coverage's move from Needs Attention to Urgent to Critical is Attention Policy. It is not escalation.

---

## Grouping, deduplication, and overload

The primary defense against noise is generation policy, in this order:

1. Routine successful operation generates nothing.
2. Notify on a meaningful transition.
3. Group related conditions.
4. Deduplicate repeats.
5. Update the existing thread.
6. Allow acknowledgement.
7. Allow snooze.
8. Digest low-priority activity.
9. Apply preferences.
10. Allow a full category to be disabled only where the control level permits it.

A condition that remains Uncovered updates one thread ("Coverage needs attention · 1B Lighthouse · Breakfast · Updated 7:27"). It does not create a new notification each evaluation. Related locations may collapse to one group ("5 locations require review before lunch") when the Department's grouping default says so. Expanding the group still deep-links to each authoritative surface.

Stable dedupe identity is the operational condition, not the event delivery attempt:

```text
facility + operational day + location + responsibility + condition
```

Offline replay, outbox retry, and duplicate domain events reuse that identity. Delivery retry does not open a second thread.

Coverage At Risk and Coverage Uncovered for the same facility, service date, Department, location, responsibility, cycle, and Coverage episode are one thread. Condition and priority stay on that thread. They do not open a second one. A later Coverage episode is a new thread. Rows 2 and 3 of the trigger matrix are the Coverage rule. The word "condition" in the general identity above does not split those two events.

A later gap after that thread is resolved is a new episode. The closed thread stays closed, so time-to-resolution and the earlier incident remain visible. N1 does not store an episode discriminator and does not open the second episode. N3 adds that discriminator before a live Coverage publisher can notify a second incident on the same day.

### What does not notify

Successful Record submission, service that starts on time, ordinary schedule edits, asset metadata edits, ordinary Work Order comments, every readiness recalculation, sync success, routine attendance, ordinary Build edits, and a return to a normal state that the policy classifies as quiet. Those remain in their own workflows and histories.

A return to normal that closes an open thread is a resolution update on that thread, not a new celebration notification, unless the Department policy explicitly asks for an Update.

---

## Notification Center

The product gains one Notification Center, opened from the shell. It is not a new home and it does not replace the Dashboard, Job Flow, or the unit workspace. It does not recreate the operational workflow.

```text
Needs Attention    operational conditions that require action
Messages           direct messages, mentions, important communication
Updates            informational changes
Resolved           recently resolved operational items
```

An operational item shows what happened, the location, the cycle or other context, the time, the priority, the recipient reason when it helps, the status, and one action. The action deep-links to the owning surface: Review Coverage, Review Evidence, the Work Order, the Asset, the conflict.

### Badges

The chat badge counts unread communication. The bell counts active operational items that require attention. The bell is not a raw unread counter of chat plus risk. Communication may still appear inside the Notification Center under Messages.

---

## Chat

Chat is a future communication domain. It is not part of N0 implementation. Its boundary is decided now so delivery can be shared later.

```text
Conversation
ConversationParticipant
ChatMessage
MessageMention
MessageReadState
Attachment
```

Conversation types may include direct messages, department groups, supervisor groups, location conversations, and conversations linked to a Work Order, an Issue, or another operational object.

Chat may reference operational work. A message does not change that work. "Room 214 is done" does not complete an EVS workflow. "Pump fixed" does not return an Asset to service. "Coverage handled" does not mark staffing Covered. The person completes the authoritative action.

An operational notification may later offer Discuss. That opens or creates a conversation linked to the operational object. The conversation coordinates. The button beside it still opens the authoritative surface.

### Chat notification defaults

| Activity | In-app | Push |
|----------|--------|------|
| Direct message | Yes | Usually |
| Mention | Yes | Usually |
| Reply to the person's thread | Yes | Usually |
| Ordinary group message | Chat unread only | Usually no |
| Reaction | Usually no | No |
| The person's own message | No | No |

A conversation may later be set to all messages, mentions only, or mute. Muting a conversation does not mute operational notifications for the same location, Department, Asset, or Issue.

If the person is already viewing the conversation, show the message, update read state, and skip a redundant push. If they are elsewhere, increment chat unread and create a communication notification when the table above says so. If they are offline, unread state remains. Push may still be attempted. The message stays authoritative whether or not delivery succeeds.

---

## Shared devices

Device context, the authenticated user, the Department, the current Assignment, and personal communication stay separate.

A shared device does not receive personal push. A location-bound shared device may show contextual operational attention after authentication. Personal chat belongs to the authenticated user. Logout clears personal conversation context and personal notifications from the device. Lock-screen and other external payloads omit operational detail that is not required to identify the alert.

Quick PIN remains workplace authentication. It does not become a channel for another person's messages.

---

## Delivery channels

| Channel | Role |
|---------|------|
| **In-app** | The persistent channel. The application database is authoritative |
| **Web / PWA push** | Transport for Urgent, Critical, and the communication or preference cases that allow it. Permission is requested in context, not at login |
| **Email** | Manager digests, Build approval, publication outcome, administrative and security events, daily or weekly summaries. Not the primary channel for active floor operations |
| **SMS** | Deferred. A later on-call Plant need must be shown in pilot evidence before SMS becomes a default |

Push denial or push failure leaves the in-app notification in place. Email failure does not change operational truth.

---

## Technical shape

V1 stays a modular monolith. Domain modules write a notification outbox row in the same transaction as the authoritative change. They do not call a push or email provider. An outbox processor runs attention policy, resolves recipients, upserts the notification and recipient state, and hands work to delivery adapters.

```text
Authoritative change
    → same database transaction
    → NotificationOutbox row
    → commit
    → processor
    → attention policy
    → recipient resolver
    → Notification + NotificationRecipient
    → NotificationDelivery adapters
```

Conceptual outbox fields: `id`, `eventType`, `facilityId`, `departmentId`, `aggregateType`, `aggregateId`, `occurredAt`, `payload`, `dedupeKey`, `processedAt`, `attemptCount`, `lastError`, `createdAt`.

Conceptual notification fields: `id`, `facilityId`, `departmentId`, `kind`, `category`, `priority`, `sourceType`, `sourceId`, `title`, `body`, `actionPath`, `groupKey`, `dedupeKey`, `requiresAcknowledgement`, `occurredAt`, `expiresAt`, `resolvedAt`, `metadata`, `createdAt`.

Conceptual recipient fields: `notificationId`, `userId`, `reason`, `seenAt`, `readAt`, `acknowledgedAt`, `snoozedUntil`, `dismissedAt`, `createdAt`.

Conceptual delivery fields: `notificationRecipientId`, `channel` (`IN_APP`, `WEB_PUSH`, `EMAIL`, `SMS`), `status`, `providerMessageId`, `attemptCount`, `queuedAt`, `sentAt`, `deliveredAt`, `failedAt`, `lastError`.

In-app is a delivery row whose success is the notification existing for that recipient. The Notification Center reads recipient state. It does not invent a second inbox store.

Some conditions are transitions and are written at commit: a Coverage transition caused by a same-Department call-off, assignment change, failed evidence, issue created, work order assigned. The call-off itself is not a notification. Others are evaluated on a schedule: Key Point still incomplete after tolerance, coverage still unresolved as service approaches, corrective action overdue, handoff overdue, preventive maintenance overdue. Both paths write the same outbox shape. V1 uses explicit typed policies. It does not add a facility-authored rules engine.

Preference storage, when it is built, holds facility defaults, Department policy, role defaults, permitted user overrides, channel, minimum priority, quiet hours, and chat preferences. Precedence is the control-level order above.

Audit records who was selected, why, which policy version applied, and each acknowledgement, escalation, and resolution. Authorization is rechecked at read and at action time.

### Event catalog

Names are stable. V1 implements the trigger matrix. The rest of the catalog is reserved so later work does not invent a second name for the same fact.

```text
coverage.became_at_risk
coverage.became_uncovered
coverage.restored
shift.called_off
assignment.changed

readiness.became_at_risk
readiness.became_degraded
readiness.restored

milestone.overdue
evidence.failed
corrective_action.overdue

issue.created
asset.out_of_service
asset.returned_to_service
asset.outage_ended
work_order.assigned
work_order.assignment_ended
work_order.overdue
work_order.overdue_resolved
work_order.overdue_ended
work_order.intervention_required
work_order.intervention_cleared
work_order.intervention_completed
work_order.intervention_cancelled
handoff.overdue

sync.conflict_detected
publication.failed

chat.message.created
chat.mention.created
chat.thread_reply.created
```

`chat.*` waits for the Chat domain. `shift.called_off` is a reserved catalog name and is not admitted. A call-off is the Workforce absence. When it changes Coverage, `coverage.became_at_risk`, `coverage.became_uncovered`, and `coverage.restored` carry the staffing consequence. A call-off on a future day stays on the shift.

---

## V1 trigger matrix

This matrix is the reference for what generates attention in the first implementation. Columns are the contract. Department presets may tighten a threshold. They may not drop a protected row.

Dedupe key, unless a row says otherwise:

```text
facility + operational day + department + location + responsibility + condition
```

Grouping key is the same identity, widened to the Department and service window when the preset groups locations.

| # | Domain | Event | Condition | Departments | Operational impact | Priority | Protected | Recipients | Ack | Escalation | Resolution source | Default delivery | User configurable | Action path | Grouping / dedupe |
|---|--------|-------|-----------|-------------|--------------------|----------|-----------|------------|-----|------------|-------------------|------------------|-------------------|-------------|-------------------|
| 1 | Shift / Coverage | `shift.called_off` | The call-off affects today's service | All that staff a service | Today's responsibility may be short | Needs Attention. Rises if coverage becomes At Risk or Uncovered | Protected once required coverage for the active or near service is Uncovered. The call-off horizon before that is facility controlled | `ON_DUTY_SUPERVISOR` | Yes when coverage is affected | Yes, to `DEPARTMENT_MANAGER`, when uncovered and unacknowledged | Coverage, when the responsibility is Covered | In-app. Push at Urgent and above | The horizon only, until the protected line | People & Coverage for that location | One thread per responsibility and day. The call-off updates the coverage thread when both describe the same gap |
| 2 | Coverage | `coverage.became_at_risk` | Derived coverage is At Risk | All with a coverage need | Responsibility may fail before service | Needs Attention | No. Facility controlled. Minimum priority Needs Attention | `ON_DUTY_SUPERVISOR` | Optional | Limited | `coverage.restored` | In-app. Push by policy | Minimum priority, within the facility minimum | Review Coverage | One thread per location, responsibility, and day |
| 3 | Coverage | `coverage.became_uncovered` | Derived coverage is Uncovered | All with a coverage need | Required responsibility has no coverage | More than 120 minutes before service, and 31 to 120 minutes: Needs Attention. Within 30 minutes: Urgent. Active service: Critical | Yes when the uncovered responsibility is required for the active or imminent service | `ON_DUTY_SUPERVISOR`, then `DEPARTMENT_MANAGER` | Yes | Yes. One acknowledgement by a primary-responsibility recipient stops expansion. The deadline is thread open plus fifteen minutes. A priority rise does not shorten it | `coverage.restored` | In-app and push at Urgent and Critical | External channel only | Review Coverage | Same thread as row 2 for that responsibility. Priority updates in place |
| 4 | Assignment | `assignment.changed` | The day's Assignment changes during the active service day | All | The person or place of work changed | Update. Needs Attention for the assignee and the on-duty supervisor while service is active | No | `CURRENT_ASSIGNEE`, `ON_DUTY_SUPERVISOR` | No | No | The service day closes, or a later change supersedes this Update | In-app | Yes, including off for routine Updates | The Assignment | One Update per Assignment change. Repeats of the same change collapse |
| 5 | Readiness | `readiness.became_at_risk` | Readiness is Needs Attention outside the urgent horizon | All | The place needs review before it blocks service | Needs Attention | No. Facility sets the horizon | `ON_DUTY_SUPERVISOR` | Optional | Limited | `readiness.restored` | In-app. Push by policy | Minimum priority, within the facility minimum | The location | One thread per location and cycle |
| 6 | Readiness | `readiness.became_degraded` | Readiness is Needs Attention inside the horizon, or during the active operation | All | The place cannot proceed at acceptable risk | Urgent while the operation is active. Critical when the protected degradation rules in the Department preset match | Yes for critical operational degradation during active service | `ON_DUTY_SUPERVISOR`, then `DEPARTMENT_MANAGER` | Yes | Yes | `readiness.restored` | In-app and push | External channel only while protected | The location | Same thread as row 5 |
| 7 | Key Point | `milestone.overdue` | A REQUIRED Key Point is past its tolerance and has no actual | Food and Nutrition first: Servery Ready, Meal Service Started. Other Departments when they define a REQUIRED Key Point | Service timing is late | Urgent. Critical when active service is materially late | Yes for those protected Key Points | `ON_DUTY_SUPERVISOR` | Yes | Yes | The Key Point actual is recorded | In-app and push | External channel only | The location's timing | One thread per Key Point, location, and service date |
| 8 | Records | `evidence.failed` | A submitted Record fails a critical or safety rule | All | Safety or regulatory exposure | Urgent. Critical when the Catalog rule is marked critical | Yes | `ON_DUTY_SUPERVISOR`, and `CURRENT_ASSIGNEE` when they own the corrective action | Yes | Yes | The Records domain, when the required corrective action is complete. The original Record stays failed | In-app and push | External channel only | Review Evidence | One thread per Record |
| 9 | Records | `corrective_action.overdue` | Corrective action is past its due time | All | The response to a failed Record is late | Needs Attention. Critical when the underlying failure is critical and still unresolved | Yes when the underlying failure is critical | The owner, `ON_DUTY_SUPERVISOR` | Yes | Yes for the protected case | The Records domain, when the corrective action is no longer overdue | In-app. Push at Urgent and above | Minimum priority until the protected line | Review Evidence | One thread per corrective action. Row 8 updates into this thread when it is the same Record |
| 10 | Issue | `issue.created` | A new Issue has operational impact | Plant, and any Department whose preset marks operational impact | Work or service is threatened | Urgent when impact is operational. Needs Attention otherwise | Protected when the impact is critical to an active operation. Otherwise facility controlled | `ON_DUTY_SUPERVISOR` of the affected Department, `ASSET_OWNER` when an asset is named | Yes when Urgent or above | Yes for unresolved high impact | The Issue domain, when the condition is closed. Work Order completion does not close this thread by itself | In-app. Push at Urgent and above | Minimum priority until the protected line | The Issue | One thread per Issue |
| 11 | Asset | `asset.out_of_service` | A critical asset leaves service | Plant, and Departments whose active operation uses the asset | Equipment cannot support the operation | Urgent. Critical when an active operation depends on it | Yes when an active operation depends on it | `ASSET_OWNER`, affected `ON_DUTY_SUPERVISOR`, `ON_CALL_RESPONDER` when the preset names one | Yes | Yes | `asset.returned_to_service` | In-app and push | External channel only while protected | The Asset | One thread per asset and outage |
| 12 | Work Order | `work_order.assigned` / `work_order.overdue` | The order requires urgent intervention, or an emergency order is created, or an urgent order is overdue | Facility Plant Operations | Maintenance response is late or unowned | Urgent when the Work Order response requirement is Immediate. Critical is not available, because the Work Order does not store a safety or continuity reason | Not protected from the response requirement. Facility controlled for ordinary overdue, defaulting to Needs Attention after the configured days (initial example: 3) | `WORK_ORDER_ASSIGNEE`, `ON_CALL_RESPONDER`, `ON_DUTY_SUPERVISOR` | Yes | Yes while unacknowledged | The Work Order domain, when the intervention is accepted or the order leaves the urgent state. Asset return-to-service remains row 11 | In-app and push for Urgent and above | Minimum priority. Off is unavailable for the protected emergency line | The Work Order | One thread per Work Order |
| 13 | Offline / sync | `sync.conflict_detected` | A conflict needs a person | All | A queued command did not apply | Needs Attention. Urgent when it blocks evidence or coverage for the active operation | In-app is required for the person who must resolve it | That user, and `ON_DUTY_SUPERVISOR` when the conflict blocks active work | Yes | Limited | The sync domain, when the conflict is resolved | In-app. Push by preference unless Urgent | Push and email. Not the in-app item for the resolver | Conflict review | One thread per conflict |
| 14 | Build | `publication.failed` | A scheduled publication failed | All | Tomorrow's operating model did not become effective | Needs Attention. Admin kind | In-app required for the publisher and the Facility Administrator | `FACILITY_ADMIN`, the Department head who scheduled it | Yes | To the Facility Administrator if the head does not acknowledge | A later publication succeeds, or the schedule is withdrawn | In-app and email | Email channel | The Build publication | One thread per publication attempt |
| 15 | Operational day | `handoff.overdue` | Supervisor handoff or closeout is past its tolerance | All that define a handoff | The next owner of the day is missing the record | Needs Attention. Urgent as the day closes | Facility controlled | `ON_DUTY_SUPERVISOR`, then `DEPARTMENT_MANAGER` | Yes | Yes | The operational-day record, when handoff or closeout is saved | In-app. Push at Urgent | Minimum priority and threshold | Closeout | One thread per Department and operational day |

Rows 2 and 3 share a thread. Rows 5 and 6 share a thread. Row 1 is not admitted. A call-off does not open its own thread. Rows 2 and 3 publish the staffing consequence when the call-off changes Coverage. Row 11 and row 12 stay separate when one asset outage and one Work Order are both true.

The live `work_order.assigned` event is narrower than row 12. Row 12's Urgent line is intervention or overdue. An ordinary assignment does not assert that. The live event is an Operational Update for `WORK_ORDER_ASSIGNEE` only. It does not read the Work Order's priority. One thread is one assignment history row. A later assignment, including a return to the same Employee, is a new thread. Reassignment, clearing the assignee, completion, and cancellation set `expiresAt` on the prior assignment attention and do not set `resolvedAt`. Holding the Work Order does not end it. `work_order.assignment_ended` is that end signal. It is not an unassigned notice. `work_order.overdue` is the missed operational deadline. It is Operational, Needs Attention, acknowledgement required, and `WORK_ORDER_ASSIGNEE` only. Repair priority does not set that priority. Immediate response is `Repair.responseRequirement`. It is not this deadline, and it is not queue priority. `work_order.intervention_required` is its own thread. On-call and the on-duty supervisor are not recipients of this deadline. One thread is one Work Order. A later deadline ends it. A later miss reopens that same thread. Completion resolves it. Cancellation, a cleared deadline, and a deadline moved out of the past set `expiresAt` and do not set `resolvedAt`. The evaluator is implemented. The production clock is inactive.

The live `evidence.failed` event is narrower than row 8. Row 8 assumes a critical Catalog rule, a corrective-action owner, and resolution when that action is complete. Records does not have those facts. `CatalogLogField.critical` and `criticalFailureForcesFailure` score an inspection. They are not notification severity. There is no corrective-action owner, and corrective text is history written in the same submission. The live event is an Operational Update for `ON_DUTY_SUPERVISOR` only. Acknowledgement is not required. It is not protected. One thread is one submitted Record: `["evidence_failed", facilityId, recordId]`. The intake key is `evidence-failed:<record id>`. Several failed fields on that Record are one event. A later Record, including a recheck, is another event when that Record is itself out of standard. A passing recheck, an Issue, and a Work Order do not change the original Update. A correction does not publish a second event and does not resolve the Update. Critical evidence policy is deferred until a Catalog criticality fact exists that is not an inspection score. The action is Review Record at `/staffing/logs/records/[recordId]`.

The live `issue.created` event is narrower than row 10. Row 10 assumes operational impact sets Urgent or Needs Attention, a protected critical line, and `ASSET_OWNER`. Issue `priority` is `RepairPriority`. Issue `operationalImpact` describes the condition. Neither is notification priority. An Issue has no assignee. Asset responsibility is not a resolvable person. The live event is an Operational Update for `ON_DUTY_SUPERVISOR` only. Acknowledgement is not required. It is not protected. One thread is one Issue: `["issue_created", facilityId, issueId]`. The intake key is `issue-created:<issue id>`. A replay, an edit, acknowledgement, and a later Work Order do not publish it again and do not resolve it. The action is Open Issue at `/asset-issues/[issueId]`.

The live `asset.out_of_service` event is narrower than row 11. Row 11 assumes Urgent or Critical when an active operation depends on the Asset, a protected line, `ASSET_OWNER`, and the on-duty supervisor. There is no fact that an active operation depends on the Asset, so the live policy stays Operational, Needs Attention, acknowledgement required, and not protected. `Asset.criticality` stays on the Asset. `ASSET_OWNER` remains unavailable. The recipient is `ON_CALL_RESPONDER` only. One thread is one outage episode: `["asset_out_of_service", facilityId, assetId, historyId]`, where `historyId` is the `AssetStatusHistory` row that entered `OUT_OF_SERVICE`. The intake key is `asset-out-of-service:<history id>`. Registration that starts at `OUT_OF_SERVICE` is initial state and does not publish. A repeat of the same status does not publish. Leaving `OUT_OF_SERVICE` for `OPERATIONAL` or `DEGRADED` publishes `asset.returned_to_service` and sets `resolvedAt` on that episode. A later outage is a new history row and a new thread. `OUT_OF_SERVICE` to `RETIRED` publishes `asset.outage_ended`, sets `expiresAt` with reason `asset_retired`, and leaves `resolvedAt` empty. The history label is Ended. An Asset with no Department still commits the status and publishes no notice. The action is Open Asset at `/assets/[assetId]`.

Row 9 is not admitted. Corrective text on a Record is submission history. It has no owner and no due time, so `corrective_action.overdue` is not a Scheduled Evaluation candidate. A recheck is another Record. Future repair or condition work is an Issue or a Work Order.

---

## Implementation sequence

N1A added one forward migration for the four records and `enqueueNotificationEvent`. That migration stays as written. N1B adds the code policy registry and the recipient resolver. N1C processes outbox rows into attention threads and in-app delivery. N1D certified that foundation. N2 adds the shell bell and the Attention Center at `/notifications`. The bell counts unresolved Needs Attention, Urgent, and Critical items for the signed-in User in the active Facility whose `expiresAt` is empty or still in the future. It does not count Updates, resolved items, expired items, or future Chat. Reading an item does not remove it. Acknowledgement stays in Needs Attention while the condition is open. An expired item leaves Needs Attention and stays in history as Ended. Snooze and multi-location presentation grouping are not implemented. Messages stay hidden until a Communication notification exists.

N3A enables `assignment.changed` from the Assignment transaction that already writes `OperationalAssignmentEvent`. The intake key is `assignment-event:<event id>`. The thread is one episode per event. A later event for the same Assignment resolves the prior open episode. Repeats of the same event collapse. The live payload does not assert that service is active, so the item is an Update. Needs Attention while service is active waits for an Operational Cycle fact the Assignment write does not own. `ON_DUTY_SUPERVISOR` resolves from the supervisor-rounding Assignment that covers the change. An Employee with no User produces no recipient and no account. A Supervisor role without that Assignment is not substituted. Plan confirmation, template apply, and call-off do not publish `assignment.changed`. No scheduler was added. N4A, N4B, N4C, and N4D are described below. N5A registers a personal browser subscription. N5B stores a durable Web Push attempt and can send only when `WEB_PUSH_SENDING_ENABLED` is exactly true. Production sending stays off. N5C shows Snooze in the Notification Center and Quiet Hours on Notifications settings, and registers `notifications.external-delivery` after escalation. Snooze never hides the Notification Center item or reduces its bell count. Quiet Hours suppress eligible informational interruptions only. Snooze expiry must be idempotent and must not resurrect cleared or invalidated Snoozes. External delivery uses the shared Scheduled Evaluation clock. Production Web Push must remain disabled until the production clock is certified. N5S revokes personal push authorization on a successful logout without a browser endpoint. N5D and later are not implemented.

Coverage owns the episode. One episode is one continuous deficiency for one slot: facility, service date, Department, space, responsibility, and cycle. The Coverage answer stays derived from `evaluateCoverageSlotState`. The episode stores when the deficiency opened and closed, and each transition stores the from and to answers. It is not a Coverage cache. At Risk and Uncovered in the same episode are one notification. `coverage.restored` closes that episode and resolves that notification. A later deficiency is a new episode and a new notification. The intake key is `coverage-transition:<transition id>`. The thread key includes the Coverage episode id. Create, edit, lifecycle, replace-cancel, and plan confirmation record the transition in the same transaction as the write. Template apply, plan reopen, and coverage-expectation publication do not. A call-off in the same Department removes that Employee's overlapping Assignment from the Coverage answer and records the Coverage transition in the same transaction. It does not publish `shift.called_off`. When the cycle window has ended, the episode closes as service ended and does not emit `coverage.restored`. That close expires the notification: `expiresAt` is set, `resolvedAt` stays empty, and the history label is Ended. A removed requirement uses the same expire path with reason `requirement_removed`. Scheduled Evaluation asks Coverage to rederive open episodes. A priority rise on the same Uncovered episode is `attention.reevaluate`, not a new Coverage transition and not a new notification. Needs Attention stays Needs Attention until 30 minutes before service, then Urgent, then Critical during service. Repeating the same band writes nothing. The Coverage time evaluator is implemented. Production does not invoke it on a clock yet.

N1 complete means the foundation only: persistence, intake, policy, the recipient-resolution contract, processing, lifecycle, and in-app availability. It does not mean a person can see a notification, that a live domain publishes one, or that push, email, preferences, escalation, or Chat exist.

A valid event may leave a thread with zero recipients when the requested responsibility cannot be resolved. That is not a processor failure, and it does not invent another recipient. A production trigger stays off until its required recipient reason can resolve, unless a published policy intentionally allows no recipient. `ON_DUTY_SUPERVISOR` reads supervisory responsibility from Assignment. Coverage supplies the episode id for a later incident. The engine does not invent that id from `resolvedAt`.

Notifications have two recipient targets. A responsibility reason is looked up from authority. An explicitly named authorized User is the other target: the source already knows the User, and the engine still checks facility and Department access. The future reason for that target is `SOURCE_USER`. It means the source named this authorized User as the person the attention is for. It is not `CURRENT_ASSIGNEE`, and it is not a sync-only word. Sync stays unprocessed until that reason exists. N1 does not add the enum.

A trigger-matrix row is not wired because its policy function exists. Before a live publisher, N3 shows all of the following: an authoritative source transition, a safe outbox write in that same transaction, a stable thread identity, a resolution source, a required recipient reason that can resolve, correct authorization, published thresholds, and an idempotency test. If the recipient fact is missing, the row is engine-ready and domain-not-ready. It stays unwired.

N3A admission, after that check:

| Event | Status |
| --- | --- |
| `assignment.changed` | Publisher enabled for create, edit, lifecycle, and replace-cancel. Policy defined. On-duty supervisor resolves when a supervisor-rounding Assignment covers the change. Service-active Needs Attention is not asserted. |
| `shift.called_off` | Intentionally not admitted. Call-off is the Workforce absence. Coverage publishes the staffing consequence. A second notice would describe the same gap. |
| `coverage.became_at_risk`, `coverage.became_uncovered`, `coverage.restored` | State transitions live from Assignment create, edit, lifecycle, replace-cancel, plan confirmation, and a same-Department call-off whose shift overlaps the Assignment. The episode id belongs to Coverage. Template apply, plan reopen, and expectation publication do not record a transition. |
| `attention.reevaluate`, `attention.expired` | Coverage time evaluator writes these. Policy still chooses priority. Expiry is not restoration. The evaluator is implemented. The production cron is not registered. |
| `readiness.became_at_risk`, `readiness.became_degraded` | Domain not ready. Runtime Location State still has no Readiness state. The on-duty recipient can resolve. |
| `milestone.overdue` | Key Point overdue evaluator implemented. Policy is Operational, Urgent, acknowledgement required, `ON_DUTY_SUPERVISOR`. The actual resolves the same thread. A due time moved out of the past ends it without calling the Key Point complete. Production clock is inactive. Critical-when-materially-late is not admitted: the domain has no separate lateness fact beyond the due minute. |
| `evidence.failed` | Live. The Record submission and the outbox row commit together when the Record is out of standard. Policy is Operational, Update, no acknowledgement, not protected, `ON_DUTY_SUPERVISOR` only. One thread per Record. Corrective text does not resolve it. Catalog inspection `critical` is not notification severity. Critical evidence policy is deferred. The action is Review Record. |
| `corrective_action.overdue` | Deferred. Corrective text on a Record is the action taken at submission. `correctiveActionAt` is not a due time. There is no open corrective-action owner. Later work is a recheck Record, an Issue, or a Work Order. This is not a Scheduled Evaluation candidate. |
| `issue.created` | Live. The Issue write and the outbox row commit together. Policy is Operational, Update, no acknowledgement, not protected, `ON_DUTY_SUPERVISOR` only. One thread per Issue. Issue priority and operational impact do not set notification priority. There is no Issue assignee. The action is Open Issue at `/asset-issues/[issueId]`. |
| `asset.out_of_service` | Live. The Asset status transition to `OUT_OF_SERVICE`, its history row, and the outbox row commit together. Policy is Operational, Needs Attention, acknowledgement required, not protected, `ON_CALL_RESPONDER` only. `ASSET_OWNER` remains unavailable. Asset criticality is not notification priority. One thread per history row. |
| `asset.returned_to_service` | Live resolution signal. A return to `OPERATIONAL` or `DEGRADED` resolves that outage episode. No new inbox item. |
| `asset.outage_ended` | Live end signal. Retirement from `OUT_OF_SERVICE` sets `expiresAt` with reason `asset_retired`. `resolvedAt` stays empty. No new inbox item. |
| `work_order.assigned` | Live. The Work Order write, the history row, and the outbox row commit together. Policy is Operational, Update, no acknowledgement, `WORK_ORDER_ASSIGNEE` only. The thread is that assignment history row. Reassignment, unassignment, completion, and cancellation end the prior attention. They do not resolve it. Repair priority is not notification priority. This does not depend on the production clock. |
| `work_order.assignment_ended` | Live end signal for that assignment attention. No new inbox item. Not an unassigned notice. |
| `work_order.overdue` | Evaluator implemented. `dueAt` is the operational deadline. A null deadline is not overdue. `targetDate` is the planning date and is not this clock. Policy is Operational, Needs Attention, acknowledgement required, `WORK_ORDER_ASSIGNEE`. Repair priority is not notification priority. Completion resolves the same thread. Deadline moved, deadline cleared, and cancellation end it. The production clock is inactive. Emergency intervention and on-call are not this event. |
| `work_order.intervention_required` | Live. An open Work Order with `responseRequirement` `IMMEDIATE` writes `WorkOrderResponseHistory` `OPENED`, and that row and the outbox commit together. Policy is Operational, Urgent, acknowledgement required, not protected, `ON_CALL_RESPONDER` only. One thread is `["work_order_intervention", facilityId, repairId, openingHistoryId]`. The intake key is `work-order-intervention:<opening history id>`. Create with Immediate publishes. Create with Standard does not. `Repair.priority` does not. There is no safety or continuity reason, so Critical and protected stay deferred. The action is Open Work Order at `/repairs/[id]`. An authorized supervisor sets Standard or Immediate on the Work Order at `/repairs/[id]`. That screen calls `setWorkOrderResponseRequirement`. It does not send the notice. |
| `work_order.intervention_cleared` | Live end signal. Immediate set back to Standard sets `expiresAt` with reason `intervention_cleared`. `resolvedAt` stays empty. No new inbox item. |
| `work_order.intervention_completed` | Live resolution signal. Completion while Immediate sets `resolvedAt`. No new inbox item. |
| `work_order.intervention_cancelled` | Live end signal. Cancellation while Immediate sets `expiresAt` with reason `work_order_cancelled`. `resolvedAt` stays empty. No new inbox item. |
| `sync.conflict_detected` | Policy defined. Publisher off. `SOURCE_USER` is not in the schema. |
| `publication.failed` | Policy defined. Publisher off. Build does not persist a failed attempt. |
| `handoff.overdue` | Deferred. Handoff is notes, not a due record. |

Supervisory responsibility is the supervisor-rounding Assignment for that Department. `resolveOnDutySupervisorResponsibility` answers who holds it at a facility instant and location. A called-off shift removes that Employee. A more specific location wins over the floor, and the floor wins over a Department-wide Assignment. Notifications read the Employee and then check the User. The Coverage episode id is part of the coverage thread key. It is not a column on Notification.

`processedAt` means the engine evaluated the outbox row and durably applied the outcome, including a terminal unsupported, deferred, or invalid evaluation. `lastError` on that row may hold a short processing note. It is not domain history. A later schema may separate outcome from error. N1 does not. A floor event with no Department is deferred and creates no thread.

| Phase | Builds | Stays out |
|-------|--------|-----------|
| **N0** | This document and the foundation, language, domain, Department, and registry updates | Application code |
| **N1** | Outbox, notification, recipient, delivery records, policy registry, recipient resolver, dedupe, resolution, audit, authorization | Push providers |
| **N2** | Bell, operational attention count, Notification Center, read, acknowledge, snooze, deep links, grouping, recipient reason | Chat badge fed by a real chat domain |
| **N3** | Integrations in order: call-offs, Assignments, Coverage, Readiness, Key Points, evidence and corrective action, Issues / Assets / Work Orders, offline conflicts, Build / Admin | Every other application event |
| **N4** | Escalation timers, protected policy, facility defaults, role defaults, user preferences, priority thresholds, quiet hours, digests | A user-authored rules engine |
| **N5** | N5A is live: personal subscription, the existing service worker, and permission UX. N5B stores one durable attempt per subscription, with retry, a fifteen-minute expiry, and generic lock-screen copy. Production sending stays off. Snooze expiry is N5C | SMS |
| **N6** | Manager digest, Build and admin email, publication results, the metrics below | Chat |
| **Later** | Chat as its own domain, reusing notification, recipient, preferences, and push | Operational acknowledgement on ordinary messages. Chat writes to Coverage, Records, Assets, or Work Orders |

---

## Certification

N1 certified the foundation checks that now have an implementation: policy fixtures, recipient authorization, read distinct from acknowledgement, acknowledgement distinct from resolution, one thread for one open Coverage episode, and in-app availability. N2 shows the bell and the Attention Center from those rows. N3A publishes Assignment changes into that center. Coverage state transitions publish into that center from the wired Assignment and plan-confirmation writes. The Coverage time evaluator can raise priority on that same thread and expire it when the window or the requirement ends. The Key Point overdue evaluator opens `milestone.overdue` for a REQUIRED location-grain Key Point and resolves it when the actual is recorded. Production does not call either evaluator on a schedule yet. `work_order.assigned` is a write-driven Update and can be live while that clock stays inactive. Acknowledgement escalation is live and is described with N4C. Snooze, quiet, and digest eligibility are live as interruption policy and are described with N4D. They do not change the Center or the bell. Presentation grouping and email are not implemented. N5A registers a personal browser subscription and does not send push.

**Policy.** Known fixtures receive the matrix priority. A worsening condition raises priority on the same thread. A protected notification cannot be disabled in-app. A facility-controlled notification respects the published threshold. A user preference cannot undercut a protected minimum.

**Recipients.** The recipient is in the right facility and Department, holds the reason the resolver names, and is the on-duty or on-call person when that is the reason. A person outside the facility receives nothing.

**Lifecycle.** Read does not acknowledge. Acknowledgement stops escalation and leaves the condition open. The owning domain's recovery resolves the thread. Snooze holds until its time. A material priority increase can break snooze when the rule says so.

**Idempotency.** A duplicate domain event, an offline replay, and an outbox retry do not create a second thread. A delivery retry does not create a second operational item.

**UX.** The bell counts active operational attention. Chat unread stays on the chat badge. A grouped item still names the condition. The action opens the owning workflow. A shared tablet does not show another user's personal communication after logout.

**Delivery failure.** Push denial and push failure leave the in-app notification. Email failure leaves operational truth unchanged.

Useful measures, once N6 exists: notifications per user per day, operational items per supervisor per shift, duplicate suppressions, grouped count, time to read, time to acknowledge, time to resolution, escalation rate, expired unread, snooze use, preference changes, action-from-notification rate, resolved-before-read rate, push failure, push opt-in. A high volume is a product defect to tune in policy, not a request for another toggle.

---

## N4 planning decision

N4A encodes the response-policy contract below. N4B reconciles current primary responsibility on the shared Scheduled Evaluation clock. N4C adds the Department head once on that clock, after reconciliation. N4D stores snooze and User+Facility quiet and digest preferences. N5A registers a personal browser subscription. N5B stores a durable Web Push attempt. Production sending stays off. N5C shows Snooze in the Notification Center and Quiet Hours on Notifications settings, and registers `notifications.external-delivery` after escalation. Snooze never hides the Notification Center item or reduces its bell count. Quiet Hours suppress eligible informational interruptions only. Snooze expiry must be idempotent and must not resurrect cleared or invalidated Snoozes. External delivery uses the shared Scheduled Evaluation clock. Production Web Push must remain disabled until the production clock is certified. N5S revokes personal push authorization on a successful logout without a browser endpoint. N5D and later are not implemented. N4 governs response to an already-admitted notification. It does not invent a condition, read Work Order priority, Asset criticality, Issue priority, or inspection scores, or replace Coverage timing, Key Point due times, or Work Order `dueAt`.

The code policy registry stays the owner of priority, acknowledgement, protected, and the first recipient reason. `notifications-n1b-v1` is that policy. There is no Facility or Department notification policy. `NotificationPreference` stores one User's quiet window and Update digest choice for one Facility. `ESCALATION_TARGET` resolves to `escalation_policy_not_published`. `DEPARTMENT_MANAGER` already resolves the Department head, including an accepted vendor head. `snoozedUntil` is written on the recipient row. The Center does not hide a snoozed item. Acknowledgement is per recipient and does not resolve the thread. A primary-responsibility acknowledgement stops escalation for the whole thread. The deadline is `Notification.createdAt` plus the code-owned fifteen-minute threshold.

Protected and Critical are separate. Critical implies protected. Protected does not imply Critical. Live proof: Key Point overdue is Urgent and protected. Uncovered Coverage during active service is Critical and protected. Uncovered Coverage more than 30 minutes before service is Needs Attention and not protected. Immediate Work Order response is Urgent and not protected.

V1 response policy stays in code. Facility and Department screens do not gain a notification rules panel. Department publication does not replace Coverage's 30-minute and active-service bands. A User preference is per Facility. It may select Updates for a later digest and may delay external delivery of Updates during quiet hours. It may not hide Needs Attention or higher, and it may not quiet the person Workforce currently names as on-duty supervisor or on-call responder.

Escalation adds the Department head after one code-owned acknowledgement threshold measured from thread open. It does not raise priority, change the source, or use delivery retries. Any one recipient who holds the thread's primary responsibility reason can stop that expansion. Read does not. Resolved and Ended cancel it. Coverage's Needs Attention to Urgent to Critical rise stays the Coverage time evaluator. It is not escalation.

Work Order overdue replaces the assignee on a later evaluation. Coverage adds a recipient only when priority rises, and it does not remove the prior one. Responsibility reconciliation is separate from both. It is live as `notifications.responsibility-reconciliation` on the existing Scheduled Evaluation clock. Current responsibility is resolved at the evaluator's now. Prior recipients are retained. Reconciliation itself does not escalate. `notifications.escalation` is the next registered evaluator in the same pass. The production clock stays inactive. Opening a page does not run it.

Quiet, snooze, and digest eligibility are delivery policy. They do not remove the Center item. Digest delivery stays in N6. Web Push sending stays in N5B.

## N4A response policy contract

`deriveResponsePolicy` reads an Attention Policy notify result and returns the response contract. It is attached as `response` on that result. It does not run from a clock, a screen, or a stored setting.

| Field | Meaning |
|---|---|
| `escalationEligible` | An operational thread that requires acknowledgement may later gain the Department head. Updates, and events that do not require acknowledgement, are not eligible |
| `acknowledgementStopsExpansion` | The same as escalation eligibility. N4C treats one acknowledgement by the primary responsibility reason as stopping further expansion for the whole thread |
| `primaryResponsibilityReason` | The single initial recipient reason. Two initial reasons, as on an Assignment change, have none |
| `responsibilityReconciliationEligible` | The single primary reason is on-duty supervisor or on-call responder, and the attention is operational and not an Update. N4B resolves that reason at evaluator time while the thread is open |
| `snooze` | `NONE`, `RECIPIENT_ALLOWED`, or `NON_RESPONSIBLE_RECIPIENT_ONLY` |
| `quiet` | `UPDATE_ONLY` or `NONE` |
| `digestEligible` | Updates only |

An Update that is protected or requires acknowledgement throws. Critical that is not protected, or that does not require acknowledgement, throws. The policy is not coerced. Protected does not set acknowledgement by itself. Protected attention cannot be snoozed, quieted, or digested, and it does not change priority or add a recipient.

Needs Attention may be snoozed when it is not protected. Unprotected Urgent may be snoozed only by someone who is not the current primary responsibility holder. N4D enforces that check. Critical and protected cannot be snoozed. Quiet and digest apply to Updates. They do not apply from Needs Attention upward.

Coverage's 120-minute, 30-minute, and active-service bands stay in Attention Policy. `attention.reevaluate` carries the response contract of the priority that band already chose. Work Order `dueAt` and Asset criticality are not inputs. `snoozedUntil` is the recipient snooze. `dismissedAt` stays reserved. It is not snooze, acknowledgement, hiding, or resolution. A priority rise clears every recipient snooze on that thread. The same band, and a drop, leave it.

## N4B responsibility reconciliation

Responsibility Reconciliation is live. The evaluator is `notifications.responsibility-reconciliation` on the shared Scheduled Evaluation clock. It is not a new engine, and it is not escalation.

An active operational thread is eligible when Response Policy says `responsibilityReconciliationEligible`, `resolvedAt` is empty, and `expiresAt` is empty. The primary reason must be `ON_DUTY_SUPERVISOR` or `ON_CALL_RESPONDER`. Updates, Work Order overdue, and the Work Order assignee are not reconciled. Coverage At Risk is reconciled even though acknowledgement is not required and escalation is not eligible.

The opening write stores `metadata.responsibility.primaryReason` on the Notification. Department stays `notification.departmentId`. Coverage and Key Point location and service date stay the thread key. An Asset outage reads the Asset's current unit and space. An Immediate Work Order reads the Repair's current unit and space. A later Department edit on the Asset or Repair does not move the thread. The evaluator supplies its own `now`. It does not use `Notification.createdAt`, the source `occurredAt`, or the opening transition time.

The evaluator adds each authorized User who holds that reason now and is not already on the thread for that reason. It creates in-app delivery for the new row only. The new recipient starts unread and unacknowledged. A prior recipient row stays, including its read and acknowledgement. The same User on a different reason does not count as the primary reason. No current holder, and an Employee with no User, add nobody and do not fall back to the Department head or the Facility Administrator. A Resolved or Ended thread is checked again inside the write and is not given a new recipient.

One pass scans at most 25 facilities, 5 pages, and 100 threads per page. It does not change priority, protected status, source identity, or source-domain state. It does not call `attention.reevaluate`. It does not write `escalationDueAt` or `escalatedAt`. Production does not invoke the clock.

## N4C acknowledgement escalation

Acknowledgement escalation is live. The evaluator is `notifications.escalation`. It is registered after `notifications.responsibility-reconciliation` and uses the same Scheduled Evaluation clock. It is not a new engine.

An active operational thread is a candidate when Response Policy says `escalationEligible`, acknowledgement is required, `escalationDueAt` is at or before the evaluator's now, `escalatedAt` is empty, `resolvedAt` is empty, and `expiresAt` is empty. The primary reason is `metadata.responsibility.primaryReason`. A thread without that snapshot is not escalated. Updates and Coverage At Risk do not receive a deadline.

The opening write sets `escalationDueAt` to `createdAt` plus fifteen minutes and stores `escalationPolicyVersion` `notifications-n4c-v1` when the thread is eligible. A later update sets that pair only when the thread has become eligible and the deadline is still empty, still measured from `createdAt`. An existing deadline is not moved and is not cleared when the source resolves or someone acknowledges. Threads already open at migration time are not backfilled. A later eligible notify can give them a deadline from their original `createdAt`, which may already be past.

The mutation re-reads the thread and re-checks primary acknowledgement inside one transaction. It adds `DEPARTMENT_MANAGER` through the existing resolver, with in-app delivery, and sets `escalatedAt` only when that recipient row is present. The explanation is that the attention was not acknowledged within the response window. The title, body, priority, protected flag, and source stay. If that User already has the Department Manager reason, the row is not duplicated and `escalatedAt` is set. The same User may also hold the primary reason; that is a second recipient row on the same Notification. A missing head does not set `escalatedAt`. After `escalatedAt` is set, a later Department-head change is not reconciled. There is no second tier.

One pass scans at most 25 facilities, 5 pages, and 100 threads per page, ordered by notification id. Opening `/notifications` does not run it. Production does not invoke the clock.

## N4D snooze, quiet, and digest eligibility

Snooze, quiet, and digest eligibility are live. They govern later external interruption. They do not change the source, priority, protected status, responsibility, acknowledgement, escalation, resolution, the Notification Center, or the bell. No Snooze button and no Quiet or Digest settings screen are shown, because push and email are not sent yet.

Snooze is `NotificationRecipient.snoozedUntil`. Only that User's rows on the thread are written. The maximum is four hours (`ATTENTION_SNOOZE_MAX_MS`). A time at or before now is refused. Clear sets the field empty. Needs Attention that is not protected may be snoozed by the recipient, including the current primary holder. Unprotected Urgent may be snoozed only when Workforce says that User does not currently hold the primary reason. Protected attention and Critical are refused. A closed thread cannot be newly snoozed. A rise from Needs Attention to Urgent, Urgent to Critical, or Needs Attention to Critical clears every snooze on the thread in the same update. The same band does not.

Quiet and Update digest live on `NotificationPreference`, unique per User and Facility. Minutes are local civil time in `Facility.timezone`, and a start after the end crosses midnight. The wall clock follows that timezone through daylight saving. A missing row means quiet is off and digest is not selected. Quiet applies only to Updates, and not to a person Workforce currently names as on-duty supervisor or on-call responder. Digest eligibility is Updates only. `evaluateDeliveryEligibility` is the contract a later channel can call. It does not send anything. Quiet Hours do not wake when they end. Digest sending is not implemented.

## N5A push subscription foundation

Subscription registration exists. This foundation does not send. N5B records the attempt.

A full User session may enable browser alerts on this personal device from Notifications settings. The browser asks permission only after that person presses Enable alerts on this device. The existing service worker at `/sw.js` receives a future push and shows:

```text
Vssyl
Operational attention requires review
```

A click opens `/notifications`, or `/notifications?attention=` when the payload carries an opaque notification id. The worker does not acknowledge, and it does not decide priority or recipients.

`PushSubscription` belongs to the User. It has no Facility column. One active browser endpoint has one owner. A later User who explicitly enables that same endpoint revokes the previous row as replaced. Logout, Quick PIN, and Harbor release the endpoint this browser is holding and do not bind it to an Employee. The next User must press Enable. Quick PIN cannot register.

The VAPID public key is served only to a User session. The private key stays on the server. `WEB_PUSH_SENDING_ENABLED` defaults off. Configuring a public key does not send. The in-app `NotificationDelivery` row is unchanged.

## N5B durable push delivery

`PushDispatch` is one Web Push attempt for one browser subscription. It is not a Notification thread and it does not replace the in-app delivery row. A new `NotificationRecipient` from opening, responsibility reconciliation, or escalation can record `recipient-added:{recipientId}`. A strict priority rise can record `priority:{recipientId}:{priority}` for each still-present recipient. The same band does not. Stored priority does not fall, so that key does not need a second transition id. `snooze-expired:{recipientId}:{snoozedUntil}` is written by `notifications.external-delivery` for the exact stored window. A cleared or replaced window is not written.

Nothing is enqueued unless `WEB_PUSH_SENDING_ENABLED` is exactly `true`. A queued row expires fifteen minutes after `queuedAt`. That clock is not the escalation deadline. An expired row is marked failed and is not sent when the flag later turns on. Historical N3 and N4 threads are not backfilled.

The network call runs after the database commit. The pass claims a row with `claimedUntil` so two workers do not send it together. The claim lease is twenty seconds. The transport timeout is five seconds. Before the call it checks the subscription, the recipient, Facility access, the open thread, and `evaluateDeliveryEligibility`. A provider acceptance is `SENT`. It does not mean the device showed the alert. A retry changes only the dispatch row. It does not escalate, raise priority, or acknowledge. A gone endpoint (HTTP 404 or 410) revokes that subscription only. HTTP 401 or 403 is configuration and does not revoke. HTTP 429 or 5xx stays retryable. Missing VAPID configuration sends nothing and does not revoke healthy subscriptions.

The shared clock is five minutes. A dispatch lives fifteen minutes. It may be attempted three times, counting the immediate post-commit attempt. The short backoff is the earliest the next attempt is eligible. The five-minute clock may wait longer. A missed tick means fewer attempts, never a fourth. A row is not sent at or after `expiresAt`. A snooze older than the fifteen-minute wake horizon is not sent late after an outage.

The payload is `{ attentionId, renotify }`. The service worker still shows "Vssyl" and "Operational attention requires review". The tag is the Notification id. `renotify` is true only on the first attempt of a priority rise. Two recipient reasons for one User stay two rows. Each reason has its own trigger. The shared tag replaces the lock-screen alert instead of stacking a second one.

The delivery pass is callable. `notifications.external-delivery` runs it from the shared Scheduled Evaluation clock, after escalation. Opening `/notifications` does not run it. Production sending stays off while that clock is inactive. N5S revokes every personal subscription for the User when logout commits, without a browser endpoint. Quick PIN and Harbor still cannot register a personal subscription.

## N5C snooze, quiet hours, and external delivery

Snooze persistence, the Notification Center controls, and snooze expiry are separate. `NotificationRecipient.snoozedUntil` is the stored pause. The Center shows Pause browser alerts for an eligible item and Resume browser alerts while that timestamp is still in the future. A past timestamp is not shown as paused, and the row is not rewritten just to say so. The item stays in its section. The bell, read state, acknowledgement, priority, and escalation fields stay as they were.

The durations are 30 minutes, 1 hour, and 4 hours. The server maps those choices from its own clock. Quiet Hours are the existing `NotificationPreference` for the signed-in User at the current Facility. The screen does not create a row on open. Minutes are the facility's civil clock. Informational Updates can be quieted. Needs Attention, Urgent, Critical, and protected attention cannot. Ending Quiet Hours does not push the Updates it suppressed.

`notifications.external-delivery` scans snoozes that expired inside the last fifteen minutes, confirms the same timestamp is still stored, and enqueues one `snooze-expired:{recipientId}:{snoozedUntil}` dispatch per active subscription when sending is exactly enabled. It then calls the existing delivery pass. It does not enqueue while sending is off, so older snoozes are not released when the flag later turns on. Two passes share the dispatch's unique key. A snooze outside that fifteen-minute horizon is not sent when a later tick resumes. The production clock is not activated. Web Push sending stays off.

Each registered evaluator keeps its own continuation on `ScheduledEvaluationLease`. One invocation keeps taking bounded Facility batches until the four-minute execution budget or until every currently eligible Facility has been visited. A batch stays at 25. The five-minute clock is the trigger. It is the per-Facility interval only when that pass finishes the whole set. `lastCycleCompletedAt` records that full pass. A later partial pass does not move it. A pass reads a bounded Facility batch after the last finished id and wraps after the end. A full page of notification threads, Coverage episodes, or snooze recipients stores the last finished id and resumes there. A failed Facility still advances the cursor so it cannot block the rest. Last attempt, last success, outcome, and failure counts live on the same row. A pass with no eligible records is a success. A pass with evaluator or processing failures does not move last success. The HTTP route returns 503 when that happens. An active lease is reported as skipped and is not a success for that evaluator. Production scheduling stays inactive.

## N5S push authorization and sign-out

Vssyl sessions are signed cookies. A full User JWT carries one `jti`. Ordinary logout writes that id to `RevokedUserSession` and clears this cookie. It does not increment `User.sessionVersion`, so another User session stays valid. A User JWT with no `jti` is rejected. Signing one out increments `User.sessionVersion` so that older credential cannot remain usable. Sign out everywhere still increments `User.sessionVersion`. The revocation table stores signed-out ids, not a live list of browsers. A delivery worker still cannot ask whether one browser session is still the session that pressed Enable.

Personal Web Push uses a server-side authorization lease instead of a second authentication system. Enable records `authorizedUntil` from the current session expiry, capped at twelve hours, and records the observed `authorizedSessionVersion`. The browser does not submit either value. A row with no lease is not eligible. Existing rows were not backfilled.

A successful User logout, device unbind, sign-out everywhere, password change, password reset, administrative User revocation, or an organization membership change that revokes sessions revokes every active personal subscription for that User before the cookie is cleared. The browser endpoint is not required. If that write fails, explicit logout and device unbind return an error and leave the session in place. Signing out of one browser revokes the phone as well. The other browser stays signed in and must press Enable again. Sign-out everywhere also increments `User.sessionVersion`. Device unbind, password change, password reset, and administrative revocation still increment that version.

Replacing a User session with a different User, Quick PIN, or a Harbor sign-in on that browser revokes the departing User's personal subscriptions before the new session is stored. The same User signing in again does not. Quick PIN and Harbor still cannot register. A client-supplied endpoint revokes only a row owned by the authenticated User. One active endpoint still has one owner.

The delivery pass re-reads the subscription after it claims the dispatch and before the network call. Revoked, expired, unbound, and inactive-User rows are suppressed. That does not delete the NotificationRecipient, change priority, acknowledgement, escalation, or the bell. Facility access is still checked separately. Losing one Facility does not revoke personal subscriptions. A queued dispatch that loses authorization is not retried.

A push already accepted by the provider, or a send already on the network when logout commits, cannot be recalled. The lock-screen text stays generic for that reason. Clearing the cookie without a server request does not revoke the row. The lease then ends at `authorizedUntil`, which is the session expiry captured at the last Enable or authenticated reconcile. No extra scheduled evaluator watches for logged-out Users.

## N5D browser certification

N5D checks the existing path in a real browser. It does not add a delivery engine. The production sending flag stays off. The production shared clock stays inactive. Vercel Hobby accepts a cron only once per day, so the five-minute Scheduled Evaluation clock cannot be turned on there.

The installed app name stays Vssyl. The manifest is standalone, scoped to `/`, and starts at `/`. PNG icons at 192 and 512, plus a 180 PNG apple touch icon, are rasterized from the existing Vssyl mark. SVG icons remain. The only service worker is `public/sw.js`, scope `/`, cache `ltc-offline-shell-v4`. Development mode still unregisters that worker. A development server is not a push certification.

Notifications settings say that signing out turns browser alerts off on every device for that account. Other devices stay signed in and must be enabled again. The account menu still says Sign out.

A click opens `/notifications?attention={id}`. The same Facility scrolls that item into view and does not mark it read or acknowledged. Another Facility the User may already enter uses the existing facility enter route and returns to that same attention path. Any other return path is ignored. A User who is not a recipient, or who cannot enter that Facility, does not gain access. The click does not acknowledge, resolve, or change priority.

Checked on November 4, 2026, on this workstation: the disposable database `ltc_verify_n1a`, Google Chrome, and Safari are present. Microsoft Edge, Android Chrome, and an iPhone or iPad Home Screen app are not. At the close of N5D, VAPID keys were not configured and no browser had received a Web Push. macOS Safari 16 on macOS 13 can receive Web Push in a tab, according to Apple. iPhone and iPad Web Push requires a Home Screen web app on iOS or iPadOS 16.4 or later, not a Safari tab. Neither was tested. Closing a browser does not revoke a subscription. The authorization lease remains the limit.

## N5D-R real browser receipt

N5D-R is the same certification continued on a disposable database. It does not turn on production sending or the production clock. A production-mode server on `http://127.0.0.1:4173` is a secure context for the Push API. It is not a deployed HTTPS certification.

On November 4, 2026, desktop Google Chrome 156 on macOS 14, using a non-incognito profile against that localhost origin, registered `public/sw.js` at scope `/`. A full User signed in, enabled alerts on that device, and the subscription persisted with an authorization lease. Moving a test Asset to Out of Service through the Asset service created the Notification and a PushDispatch. The first push-service response was gone and revoked the row. The same endpoint was accepted on a later send after the row was restored. The service worker displayed title Vssyl and body “Operational attention requires review.” The macOS banner showed that same text and the origin. It did not show the Facility, Department, Asset, or source title. The click on that banner was not completed. Disable alerts revoked the row with reason USER_DISABLED and unsubscribed the browser. Sign-out returned 303, cleared the session, and left no active subscription. A later Out of Service event created a recipient and sent no new Web Push. A second User in a fresh profile was not enabled and owned no subscription.

A 404 or 410 from the push service revokes that subscription and is not retried. RFC 8030 uses 404 for an expired subscription. The Web Push status guide uses 410 when the subscription is gone. A 400 or 413 fails that dispatch and leaves the subscription in place. A 401 or 403 stops the pass as configuration and does not revoke the browser endpoint. A 429 or 5xx stays on the existing bounded retry. Production sending stays off. The production shared clock stays inactive.

## N5D-R2 Chrome lifecycle

N5D-R2 removed the one-time 404/410 retry. On November 4, 2026, a fresh desktop Chrome 156 subscription on `http://127.0.0.1:4173` received the first canonical Asset outage on the first delivery attempt. The dispatch was `SENT` with one attempt. No subscription row was restored by hand. The service worker showed title Vssyl and body “Operational attention requires review.”

Clicks on that macOS banner did not close it and did not run `notificationclick`. Notification Center did not expose an accessibility window. The worker now keeps going when focusing a window fails, and opens a window when navigation does not. That path was not proven by a click.

Snooze from the Notification Center paused browser alerts until a facility-local time, left the item and the bell in place, and did not mark the item read or acknowledged. The external-delivery evaluator created no wake during the pause and one sent wake at expiry. Resume cleared the other item's pause.

Quiet Hours saved 22:00–07:00 for the test facility on the America/New_York clock and reloaded. 22:30 is inside that window. 07:00 and 21:59 are outside. An Asset outage during a saved all-day quiet window was still sent. The Issue that opened during that window had no recipient for the signed-in User.

A logout request that returned 303 and sent the browser to the login page left the subscription authorized. A later outage was sent. The account-menu Sign out control was not completed in this pass.

## N5D-R3 Logout and Quiet Hours

N5D-R2's 303 came from a logout that cleared the session even when the server had not identified the User. The account menu treated that redirect as success. N5D-R3 keeps the session cookie until User-wide push revocation commits. The account menu posts JSON. It finishes sign-out only on HTTP 200 with outcome `revoked`. An unidentified session returns 401 and leaves the cookie. A database failure still returns 503 and leaves the cookie. A no-JS form post that does not identify a User redirects to login and does not clear the cookie.

On November 4, 2026, the account menu on `http://127.0.0.1:4173` in desktop Chrome 156 posted that JSON logout for a signed-in User with one active subscription. The subscription row was revoked with reason `LOGOUT` while its authorization lease was still in the future. The response cleared the session cookie. A later open of the account page returned to login, and the browser had no local subscription. A later Asset outage still named that User as the On-Call recipient and created no push dispatch. A queued Needs Attention dispatch for the revoked subscription was suppressed as `subscription_revoked` and did not call the transport.

The same User received `work_order.assigned` as `WORK_ORDER_ASSIGNEE`. Outside Quiet Hours that Update was sent. Inside a saved 00:00–23:59 window on America/New_York it was suppressed as `quiet`, and the sent count did not rise. An Asset outage in that same window was still sent.

A real macOS notification click still did not reach the worker. The display capture could not select the banner. The click handler was not changed in this pass.

Production sending stays off. The production shared clock stays inactive.

## N5D-M Cross-browser inventory

N5D-M did not add a browser policy, a second delivery engine, or a production sender. On November 4, 2026, the same localhost production-mode build used for N5D-R3 was opened in Safari 26.4 on macOS 14.8.7. The Vssyl sign-in page rendered. The sign-in control stayed on "Signing in..." and the address stayed on `/login`. Push permission, a PushSubscription, provider acceptance, an operating-system notification, and a click were not observed. Remote automation and JavaScript from Apple Events were unavailable, so service-worker scope and `PushManager` were not readable from the page.

Microsoft Edge was not installed. No Android device and no iPhone or iPad were available. The existing Vercel staging project is not an isolated disposable database and was not used for sending. Production sending stays off. The production shared clock stays inactive.

## N5D-E Sign-in environment

N5D-E did not change authentication or the notification engine. On this Mac, production mode sets `ltc_session` with `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`, and no Domain. Safari 26.4 on macOS 14.8.7 was given a plain-HTTP loopback page that set one `Secure` cookie and one ordinary cookie. Safari sent only the ordinary cookie back, on both `127.0.0.1` and `localhost`. A separate Chrome process on `http://127.0.0.1` sent both. That is the first difference from the Chrome sign-in that succeeded on `http://127.0.0.1:4173`.

Safari 27 documents `Secure` cookies on loopback HTTP, and the WebKit change is limited to macOS 26 and later. This Mac is macOS 14.8.7. The production cookie flag stays `Secure`. Safari certification needs an isolated HTTPS origin. `ltc-manager-staging` remains a hosted database behind SSO, with no test VAPID keys and no test sending flag, and was not changed.

JavaScript from Apple Events stayed off. The Vssyl login form was not submitted again. Push permission and a Safari subscription were not attempted. Production sending stays off. The production shared clock stays inactive.

## N5D-H HTTPS environment plan

N5D-H did not provision a host, a database, or VAPID keys. The Vercel team has three projects: `ltc-manager`, `ltc-manager-staging`, and `nextjs`. None is an isolated certification origin. Production and staging both use a hosted database and Vercel Authentication. Neither environment lists test VAPID keys or `WEB_PUSH_SENDING_ENABLED`. The loopback database `ltc_verify_n1a` remains the disposable local database. It cannot satisfy Safari's `Secure` cookie requirement.

The proposed environment is a new Vercel project and a separate Neon Free project, with manual connection strings, test-only VAPID keys, and test-only sending after the database host is verified. Vercel Authentication stays off on that new project so the service worker and Vssyl login are reachable. Existing projects stay unchanged. `vercel.json` stays unchanged. Production sending stays off. The production shared clock stays inactive.

N5D-H2 created the isolated certification project `vssyl-cert` and a separate Neon Free database. The Vercel account remains Hobby and the Neon organization remains Free. No plan was changed and no new charge was added. Vercel Authentication is off on `vssyl-cert` only. Project cron execution is disabled there, and `vercel.json` was not edited. The deployed source is the current working tree, uploaded by the CLI, not an older Git commit. Production and staging projects, secrets, and databases were not changed.

Safari 26.4 on macOS 14.8.7 signed in at `https://vssyl-cert.vercel.app`, kept the `Secure` session cookie, and opened My Account → Notifications. Enabling alerts produced the Safari permission sheet. Allowing it stored a PushSubscription for that full User at `web.push.apple.com`. The canonical Asset condition change to Out of Service created one Operational notification, one on-call recipient, and one push dispatch. Apple answered `403` with `BadJwtToken`. No notification banner was shown, and no notification click was available. The Safari window then left the capturable display, so Disable and account-menu sign-out were not completed in Safari. Production sending stays off. The production shared clock stays inactive.

N5D-H3 changed only the certification VAPID subject, from `mailto:vssyl-cert@example.test` to `https://vssyl-cert.vercel.app`. The certification key pair was not rotated. The same Safari subscription then received a fresh Asset Out of Service notification. The push dispatch was recorded `SENT`. The earlier `403 BadJwtToken` did not recur. No macOS banner was visible, and the account-menu sign-out was not completed. Safari Disable did revoke that subscription with reason `USER_DISABLED`. Customer production sending stays off. The production shared clock stays inactive.

N5D-H4 certified Safari on the isolated origin. A local `showNotification()` call displayed the generic Vssyl banner. A fresh Enable-alerts subscription then received one canonical Asset Out of Service push, recorded `SENT`. The person saw that banner, clicked it, and Vssyl opened the matching Attention item. Read and Acknowledged were separate later actions. The asset stayed Out of Service and the notification stayed unresolved. Account-menu sign-out revoked that subscription with reason `LOGOUT` and returned Safari to the login page. That sign-out left `sessionVersion` at 0, so the previously issued cookie was still accepted. N5S-R5 records the signed-out User credential by `jti` and rejects a replay of that cookie. Another User session keeps its own id. A User token with no `jti` is rejected. Sign out everywhere still increments `User.sessionVersion`. Certification sending stays off. Customer production sending stays off. The production shared clock stays inactive.

## Non-goals

This decision does not add a notification microservice, a Kafka or other event-stream platform, AI urgency scoring, a facility-authored rules language, SMS as a default floor channel, a per-Department notification engine, a workflow inside the Notification Center that duplicates the owning domain, or a chat message that mutates operational state.

---

## Engine decision

The [registry template](./15_PLATFORM_PRIMITIVES_AND_ENGINES_REGISTRY.md#template-for-proposing-a-new-engine) is answered as follows. The product owner accepted it on October 29, 2026.

| Question | Answer |
|----------|--------|
| Missing capability | One department-agnostic way to deliver human attention, with acknowledgement, escalation, dedupe, and more than one channel |
| Why no existing owner | Coverage, Readiness, Records, Assets, Issues, and Work Orders own their facts. Dashboard Attention only composes current items for one home and persists nothing. Harbor support notices serve Console staff |
| Why composition is insufficient | Delivery, acknowledgement, snooze, escalation, and retry must survive after the person leaves the Dashboard, and must not be recomputed from scratch into a second inbox on every screen |
| Source of truth | Notification, recipient, and delivery rows for attention. The operational condition remains with its domain |
| Lifecycle | Unread, read, acknowledged, snoozed, escalated, resolved, as defined above |
| Will not own | Operational truth, chat messages, Dashboard card contents, a second issue queue |
| Domains it touches | All operational domains as event publishers. Identity and authorization for recipients. Audit for the trail |
| Department Products | Every installed Department, through published policy |
| Surfaces | Shell bell, Notification Center, deep links into existing homes. Email and push when those phases exist |
| History | Attention history is the notification trail. It does not replace Audit / Reports |
| Parallel model | It does not copy location, people, catalog, Work, Records, or Assets |
| Decision | Accepted. N1 foundation certified. N2 Attention Center implemented. N3A publishes `assignment.changed`. Coverage state transitions are live. The Coverage time evaluator and the Key Point overdue evaluator are implemented and the production scheduler is blocked. `work_order.assigned` is live. The `work_order.overdue` evaluator is implemented. N4B responsibility reconciliation and N4C acknowledgement escalation are registered on that same clock, reconciliation first. N4D stores snooze and delivery preferences. N5C registers `notifications.external-delivery` on that same clock after escalation. N5S revokes personal push authorization on a successful logout without a browser endpoint. N5D records the browser click handoff and the PNG icon requirement. N5D-R2 recorded a first-attempt desktop Chrome receipt on localhost production mode without restoring the subscription. N5D-R3 certified account-menu sign-out: the session cookie clears only after User-wide push revocation, and a revoked subscription does not send. Quiet Hours suppressed a real Work Order assignment Update for the signed-in User. The operating-system notification click, other browsers, and a deployed HTTPS origin were not certified. N5D-M opened that same build in Safari 26.4 and did not complete sign-in, so Safari push was not certified. N5D-E measured that this Safari stores an ordinary loopback cookie and drops a `Secure` cookie on `http://127.0.0.1` and `http://localhost`, while Chrome stores the `Secure` cookie. No authentication change was made. N5D-H audited deployment and database hosting and stopped before creating a certification project. Edge, Android Chrome, and an iPhone or iPad Home Screen app were not available. The existing staging deployment was not an isolated test origin and was not used. The production clock is inactive. Production sending stays off. Other triggers stay unwired. Not production-ready |

---

## Certified guidebook reconciliation

The living authority is this file plus the October 29, 2026 foundation amendment. The compiled guidebook PDFs are amended as follows. Where a PDF paragraph and this section disagree, this section and the foundation win.

**Chapter 3 — Operational Language.** Add Notification, Attention, Communication, Priority, Update, Needs Attention (the priority), Urgent, Critical, Read, Acknowledged, Snoozed, Escalated, Resolved, Protected notification, and Recipient reason. Keep Coverage words and Readiness words as they already stand. State the three scales in [Three different scales](#three-different-scales).

**Chapter 4 — Build Architecture.** Department Builder includes Notifications & Attention Policy: event policy, defaults, importance thresholds, timing tolerances, recipient responsibility, protected categories, escalation, and the boundary between facility minimums and Department policy. Policy is draft, then published, then effective on a service date. It is not live floor command.

**Chapter 5 — Runtime Architecture.** Add Operational Attention: runtime events, the active thread, dynamic priority, acknowledgement, snooze, escalation, resolution, the difference between task completion and operational recovery, and offline replay that must not duplicate a thread.

**Chapter 6 — UX.** Add the Notification Center, the bell, the separate chat unread badge, the four groups, priority display, deep links, acknowledge and snooze, the recipient-reason line, preference UX, shared-device privacy, contextual push permission, and exception-first presentation.

**Chapter 7 — Platform Technical Architecture.** Add this engine: outbox, event catalog, typed policy, recipient resolver, grouping and dedupe, the three records, escalation, preferences, delivery adapters, idempotency, authorization, audit, and scheduled evaluation. Chat is a future producer on the same delivery path.

**Chapter 8 — Product Scope, Delivery & Governance.** Certification of a notification workflow requires one owner per condition, this trigger matrix, a protected-notification review, an alert-fatigue review, a role-recipient review, escalation tests, offline replay tests, privacy tests, delivery-failure behavior, and a check that Dietary, EVS, and Plant presets run on one engine. Shipping N1 is a later scope admission. N0 is the boundary that makes that admission reviewable.

**Compiled edition.** Those six amendments are the reconciliation. Historical sentences that treat Experience packs as the declarers of notification kinds, or that treat a support-ticket notice as the facility notification model, are not the authority for this engine.
