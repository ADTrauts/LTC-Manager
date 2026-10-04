# Support tickets

Canonical support domain for Vssyl Console. Code: `src/lib/support/`. Schema: `SupportContact`,
`SupportTicket`, `SupportTicketMessage`, `SupportTicketEvent`, `SupportSavedReply`, `SupportTag`,
`SupportTicketTag`, `SupportMacro`, `SupportMacroTag`, `SupportMacroApplication`,
`SupportStaffNotification` in `prisma/schema.prisma`.

## Ownership and boundaries

- Support tickets belong to **Vssyl Console** (`/console/tickets`), worked by `PlatformStaff`.
  Every Console server action calls `requireHarborStaff()` first; facility sessions never reach
  Console.
- Customers never see Console tickets. Facility Vssyl exposes **Help & Support** (`/help`) only:
  the public address `support@vssyl.com` and a `mailto` action. There is no in-app ticket form,
  customer ticket portal, or chat.
- Reply routing stays on the inbound domain: `support+{token}@reply.vssyl.com`. That address is
  infrastructure. Customer-facing copy never tells people to email `support@reply.vssyl.com`.
- Support is Vssyl talking to its customers. It is **not** facility operations: it does not use or
  feed `OperationalRequest`, `Repair`, `AssetIssue`, `Task`, or `IssueType`.
- Email is a **transport**, not the record. The ticket and its messages are the record; Postmark
  carries outbound replies and inbound mail.
- The legacy `ConsoleTicket` / `ConsoleTicketMessage` tables are kept read-only for history. Their
  rows were copied into the support tables by `20261001130000_support_ticket` (ticket ids kept).

## Model

| Concept | Values / rule |
|---------|---------------|
| Number | Postgres sequence from 1001, shown as `VSS-1001`. Never `count + 1`. |
| Status | `NEW`, `OPEN`, `WAITING_ON_CUSTOMER`, `RESOLVED`, `CLOSED` |
| Type | Optional: `SUPPORT`, `BUG`, `FEATURE_REQUEST`, `IMPROVEMENT`, `ACCOUNT_ACCESS`, `BILLING`, `OTHER` |
| Priority | `LOW`, `NORMAL` (default), `HIGH`, `URGENT` |
| Contact | `SupportContact`, unique lowercased email. Linked to a `User` only when exactly one active, verified user has that email. A contact may have no user and no facility. |
| Facility | Optional on the ticket. Changing it never changes the contact. |
| Reply token | 40 lowercase hex chars, unique, never shown in the UI. Routes customer replies via `Reply-To: support+{token}@…`. |

Status transitions (`src/lib/support/status-transition.ts`):

| From | To |
|------|----|
| NEW | OPEN, WAITING_ON_CUSTOMER, RESOLVED, CLOSED |
| OPEN | WAITING_ON_CUSTOMER, RESOLVED, CLOSED |
| WAITING_ON_CUSTOMER | OPEN, RESOLVED, CLOSED |
| RESOLVED | OPEN, CLOSED |
| CLOSED | — (final) |

Entering `RESOLVED` sets `resolvedAt`; reopening clears it. Entering `CLOSED` sets `closedAt`.
Staff-opened tickets start `OPEN`; tickets opened by inbound email start `NEW`.

## Console list (search, filters, queues)

Harbor staff only (`/console/tickets`). Facility sessions cannot query tickets. Code:
`src/lib/support/list-query.ts`, `list.ts`, `queues.ts`.

State lives in the URL: `q`, `queue`, `status`, `priority`, `type`, `assignee`, `facility`,
`contact`, `tag`, `updated`, `page`. Queue tabs keep `q` and compatible refinements (priority, type,
facility, contact, tag, date) and drop status, assignee, and page. **Clear filters** returns to the
current queue with no refinements. Queue sets the canonical scope; extra filters AND with it
(`Unassigned` + `HIGH`). Contradictory combinations (New + status=OPEN) return empty results rather
than a silent override.

`contact=<SupportContact id>` is a Harbor-only refinement from ticket/contact context. It is not
shown as a dropdown on the main list. The ticket-number fast path still ignores other filters,
including contact.

Search (`q`) is case-insensitive `contains` on ticket subject, contact email, contact display name,
facility name, and **all** message `bodyText` including internal notes. Notes may match because
search is Console-only; note text is never shown on customer surfaces. No snippets. Not searched:
headers, provider IDs, storage keys, attachment bytes, HTML bodies.

Ticket-number fast path: `VSS-1002`, `vss-1002`, `[VSS-1002]`, or `1002`. Bare digits must be four
or more characters and at least 1001. If that exact ticket exists, the list returns only that row
and ignores other filters. `7` or `42` stay ordinary text search.

Default sort is `updatedAt` descending. **New** and **Unassigned** sort oldest-updated first for
FIFO triage. Page size is 25; search runs in the database, not on the current page.

Queues are deterministic filters, not stored objects:

| Queue | Rule |
|-------|------|
| All | no extra constraint |
| Unassigned | `assignedStaffId` is null and status in NEW / OPEN / WAITING_ON_CUSTOMER |
| My tickets | `assignedStaffId` is the current staff member, same active statuses |
| New / Open / Waiting / Resolved / Closed | that status |
| High + Urgent | priority HIGH or URGENT, and active status |
| Recently updated | active status, newest `updatedAt` first |

Date presets (`updated`): Today is the America/New_York calendar day; Last 7 / 30 days are rolling
windows. Indexes already cover `number`, `(status, updatedAt)`, `(assignedStaffId, status)`, and
`facilityId`. Message `contains` is acceptable at current volume; add Postgres full-text only when
list queries show it.

Tag filter is explicit (`?tag=reporting`). Free-text `q` does not search tag names. List rows show
the first two tag names and `+N` overflow.

## Saved replies

Harbor-only shared library (`/console/tickets/saved-replies`). Every staff member sees the same
active replies. There are no per-user, team, or facility libraries.

Inserting a saved reply copies rendered text into the customer-reply draft. The operator can edit
it. Nothing sends automatically. Sent messages store the final body only; they do not keep a live
reference to the template.

Optional variables, resolved at insert time:

- `{{customer.first_name}}`
- `{{customer.name}}`
- `{{ticket.number}}`
- `{{facility.name}}`
- `{{staff.name}}`

Missing values become empty strings. Unknown tokens are left as written. No conditionals or
expressions.

Saved replies are reusable message text. They are not Macros.

No starter library is seeded. Staff create replies in Console. Soft-deactivate instead of delete.

## Tags

Harbor-only topic labels (`/console/tickets/tags`). Type answers what kind of request this is
(`BUG`, `BILLING`). A tag answers what area is involved (`reporting`, `permissions`, `export`).

Normalization: trim, collapse internal whitespace, lowercase for uniqueness. Display name is
preserved. Max 40 characters. No nested tags, colors, or groups.

`SupportTicketTag` records `addedByStaffId` and `addedAt`. Add/remove does **not** write
`SupportTicketEvent` rows (the customer-support timeline stays about status, assignment, and mail).
Removal deletes the join row; there is no removal audit log yet.

Deactivated tags stay on existing tickets and remain filterable. They are not offered for new
assignments. Rename keeps ticket relationships. No hard delete.

## Macros

Harbor-only action bundles (`/console/tickets/macros`). A Macro prepares a ticket and optional
draft. It never sends email. The operator reviews and sends explicitly.

| Concept | Meaning |
|---------|---------|
| Saved Reply | reusable message text |
| Macro | reusable bundle of operator actions |
| Automation | future event/time-triggered behavior (not implemented) |

A Macro optionally **references** a Saved Reply. It does not store a second template body. Apply
renders the current active Saved Reply with the same variables. If that reply is inactive or
missing, ticket actions still apply and draft insertion is skipped with a warning. Sent mail stores
the final draft only.

Immediate actions (one transaction):

- type, priority
- assignment: no change / me / specific staff / unassign
- add tags (no removal; duplicates ignored; inactive tags skipped)
- immediate status, except `WAITING_ON_CUSTOMER` when a Saved Reply is attached

Send-time:

- `statusAfterReply` (typically `WAITING_ON_CUSTOMER`) is placed on the existing Status after reply
  control and applied by `sendSupportReply` only after the operator sends

CLOSED tickets cannot receive a Macro. Reopen first. `RESOLVED` uses existing `resolvedAt` logic.
No facility action. Macros are not a list filter.

Canonical `SupportTicketEvent` rows are written for status/type/priority/assignment changes.
`metadata` may include `source: "MACRO"`, `macroId`, and a `macroName` snapshot. Tag adds stay
join-only. `SupportMacroApplication` records each apply (`macroName` snapshot). Soft-deactivate;
no hard delete after use.

## Support history

Harbor-only context derived from `SupportTicket`. It is not a second CRM or ticket store. Counts and
recent rows are queried; there is no summary table.

Active tickets use the same queue definition: `NEW`, `OPEN`, `WAITING_ON_CUSTOMER`. `RESOLVED` and
`CLOSED` are not active.

**SupportContact history** (`/console/support/contacts/[contactId]`) belongs to the contact record
(normalized email), not the current user or facility relationship. A contact may have no user and no
facility. If the contact later changes facility, historical tickets keep their original
`SupportTicket.facilityId`.

Shows total/active/waiting/resolved/closed, last ticket `updatedAt`, and the 5 most recently updated
tickets (`updatedAt` desc, then `number` desc). **View all** opens `/console/tickets?contact=…`.
Empty: “No previous support history.”

**Facility history** on `/console/customers/[facilityId]` includes only tickets whose
`SupportTicket.facilityId` is that facility. It does not infer from user membership, the contact’s
current facility, or email domain. Unlinked tickets stay out of facility history. Empty: “No support
tickets for this facility.” Recent requesters come from those recent ticket rows.

Ticket detail links the requester to the contact page and “N previous tickets” (excluding the
current ticket) to the contact-filtered list. Facility context is “N support tickets · M active”
and opens the facility-filtered list. Requester name/email and facility name are Harbor-only
navigation.

History rows select ticket identity, status, priority/type, and `updatedAt` only. No message bodies,
headers, provider IDs, notes, or attachments. Delivery warnings and tags are omitted from the
summary.

## Notifications

Harbor-only inbox rows (`SupportStaffNotification`) plus optional internal staff email. A
notification informs a Harbor staff member. It is not Automation: nothing is sent to the customer
and ticket state is not changed by the notification itself.

| Type | Recipients | Console | Staff email |
|------|------------|---------|-------------|
| `NEW_TICKET` | All active Harbor staff | Yes | Yes |
| `ASSIGNED_TO_ME` | Newly assigned staff, not the actor | Yes | No |
| `CUSTOMER_REPLIED` | Assignee only. Unassigned: none | Yes | Yes |
| `HIGH_PRIORITY` | Assignee, or all active staff if unassigned; not the actor | Yes | No |
| `URGENT_PRIORITY` | Same as HIGH | Yes | Yes |
| `DELIVERY_FAILED` | Assignee, or all active staff if unassigned | Yes | No |
| `BOUNCED` | Same | Yes | Yes |
| `SPAM_COMPLAINT` | Same | Yes | Yes |

Self-assignment and unassign produce no assignment notification. `HIGH → URGENT` notifies again.
`URGENT → HIGH` does not. Notes, outbound mail, and Auto-Submitted inbound mail do not create
`CUSTOMER_REPLIED`. PlatformStaff has no support-role split, so fan-out is every active Harbor
staff member.

Idempotency is `dedupeKey` (`type + staffId + source`). Retried inbound or bounce webhooks do not
create a second row. Email send is after commit; failure is logged and never rolls back the
support mutation. Staff mail uses `sendTransactionalEmail` (tag `support-staff-notification`),
not the customer reply template, and never adds a Reply-To token.

Console: bell in the Harbor shell, last 50, unread count, mark one / mark all read. Click opens
`/console/tickets/[ticketId]`. Staff see only their own rows. Facility users cannot access
Console. Retention cleanup is deferred; rows persist.

Preferences are deferred. No snooze, archive, or folders.

## Messages and events

- `INBOUND`: customer email. Requires a contact; no staff author or delivery state.
- `OUTBOUND`: staff reply emailed to the contact. Requires an author, a delivery status, and a
  `clientSubmissionId`.
- `NOTE`: internal only, never emailed. Requires an author; no email or delivery fields.

These rules are enforced in the service layer and by `CHECK` constraints.

`SupportTicketEvent` records `CREATED`, `STATUS_CHANGED`, `ASSIGNMENT_CHANGED`,
`PRIORITY_CHANGED`, `TYPE_CHANGED`, `FACILITY_CHANGED`, `CONTACT_CHANGED`, `SUBJECT_CHANGED`. An event
is written only when a value actually changes. Assignment and facility events snapshot the names
involved in `metadata`. A status change made with a reply points at that reply via
`causedByMessageId`.

## Outbound replies

1. Transaction: insert the `OUTBOUND` message as `PENDING` (with a generated RFC `Message-ID`, the
   sender, and the ticket's routed `Reply-To`), apply any status change, touch `updatedAt`. A
   repeated `clientSubmissionId` returns the first message and sends nothing.
2. After commit, send through Postmark template `console-ticket-reply` with `From`, `ReplyTo`,
   `Message-ID`, `X-PM-KeepID: true`, and Metadata `supportTicketId`, `supportTicketNumber`,
   `supportMessageId`.
3. Mark `SENT` (with `providerMessageId`, `sentAt`) or `FAILED` (with a readable `deliveryError`).
   `SENT` means Postmark accepted the submission. It is not proof the customer's mail server
   accepted the message. Messages are never deleted; a failed reply stays on the timeline.
4. Later Postmark Delivery / Bounce / Spam Complaint webhooks update the same outbound row by
   `providerMessageId`. See [Outbound delivery](#outbound-delivery).

`providerMessageId` and `clientSubmissionId` are unique. `internetMessageId` is indexed but not
unique, because inbound mail may repeat IDs.

Sender: `SUPPORT_FROM_EMAIL` (for example `Vssyl Support <support@vssyl.com>`), falling back to
`POSTMARK_FROM_EMAIL`. Other transactional email keeps `POSTMARK_FROM_EMAIL`.

Reply-To: `support+{replyToken}@{inbound domain}`, built from `SUPPORT_REPLY_ADDRESS`. It is set only
when `SUPPORT_REPLY_ADDRESS` and both inbound webhook credentials are configured, so replies are
never routed to an address nobody receives. The token appears in email headers by necessity; Console
never shows it.

## Outbound delivery

`SENT` is not `DELIVERED`. Postmark inbound Basic Auth does **not** apply to these webhooks.

| Status | Meaning |
|--------|---------|
| `PENDING` | Reply recorded; not yet submitted to Postmark |
| `SENT` | Postmark accepted the outbound submission |
| `FAILED` | Postmark rejected the submission |
| `DELIVERED` | The recipient mail server accepted the message (not inbox placement) |
| `BOUNCED` | Postmark reported a bounce after acceptance |
| `SPAM_COMPLAINT` | The recipient marked the message as spam |

Correlation is only `Postmark MessageID` → `SupportTicketMessage.providerMessageId`. Subject, ticket
number, and recipient are not used. An unknown MessageID (other transactional mail on the same
server, or a Postmark verification probe) is acknowledged with 200 and does not mutate records.

Route: `POST /api/support/email-events`. One URL handles `RecordType` `Delivery`, `Bounce`, and
`SpamComplaint`. HTTP Basic Auth uses `POSTMARK_OUTBOUND_WEBHOOK_USERNAME` /
`POSTMARK_OUTBOUND_WEBHOOK_PASSWORD`. Postmark does not sign outbound webhooks. Configure the URL
as `https://{username}:{password}@vssyl.com/api/support/email-events` on the **outbound** message
stream (Delivery, Bounce, and Spam Complaint triggers). This is not the inbound stream webhook.

Outbound webhook retries (Postmark docs): 5xx, 408, 429, and network failures retry; other 4xx
including 401 and 403 are permanent. Vssyl returns 401 for bad credentials, 403 for malformed
payloads, 503 when credentials are missing, 500 on processing failure.

Idempotency: message state plus timestamps. A repeated Delivery stays `DELIVERED` with the first
`deliveredAt`. A repeated Bounce or complaint does not write a second `SupportTicketEvent`.

Precedence (never downgrade):

`PENDING` → `SENT` or `FAILED`  
`SENT` → `DELIVERED`  
`SENT` or `DELIVERED` → `BOUNCED`  
`SENT`, `DELIVERED`, or `BOUNCED` → `SPAM_COMPLAINT`

A later Delivery cannot overwrite `BOUNCED` or `SPAM_COMPLAINT`.

Bounce: persist `bounceType`, `bounceCode`, `bounceDescription` (truncated). Console says “Mailbox
does not exist” for hard bounces and “Temporary delivery problem” for soft/transient. Permanent
hard bounce (`HardBounce` / TypeCode 1, or inactive and not soft/transient): if that reply set the
ticket to `WAITING_ON_CUSTOMER` (`STATUS_CHANGED.causedByMessageId`), reopen to `OPEN`. Soft bounces
warn only. `EMAIL_BOUNCED` is written once.

Spam complaint: `SPAM_COMPLAINT`, `EMAIL_COMPLAINT` once, prominent ticket warning. Do not send
automated follow-ups to that address until staff resolve it. Account-wide suppression UI is not
built; Postmark also deactivates the address on its side.

Successful `DELIVERED` does not write a timeline event. The message row is canonical.

Console: compact “Sent …” / “Delivered …” on healthy replies. Failures, bounces, and complaints are
red. If the newest outbound message is `FAILED`, `BOUNCED`, or `SPAM_COMPLAINT`, the ticket shows a
warning. Provider IDs are not shown.

Safe bounce tests: Postmark's blackhole addresses on `bounce-testing.postmarkapp.com` (for example
`hardbounce@bounce-testing.postmarkapp.com`), not random fake domains. Safe complaint tests:
Postmark's documented `SpamComplaint` JSON posted to `/api/support/email-events`. Postmark does not
offer a blackhole spam-complaint address; do not generate a real user spam report.

### Production certification (2026-10-03)

Live on Vssyl Production, Default Transactional Stream (`outbound`):

- Webhook URL `https://vssyl.com/api/support/email-events` with outbound Basic Auth (env names
  `POSTMARK_OUTBOUND_WEBHOOK_USERNAME` / `POSTMARK_OUTBOUND_WEBHOOK_PASSWORD` on Vercel Production
  and Preview). Status **Verified**. Triggers: Delivery, Bounce, Spam Complaint only.
- Postmark Check/Test: Delivery, Bounce, and Spam Complaint each returned **Verified** (HTTP 200).
- Live send: VSS-1002 reply accepted as `SENT`, then Delivery webhook moved it to `DELIVERED` with
  `deliveredAt`. A repeated Delivery returned `duplicate` and did not change state.
- Bounce: support send to `hardbounce@bounce-testing.postmarkapp.com` on VSS-1003. Message became
  `BOUNCED` (`HardBounce` / TypeCode 1). The reply had set `WAITING_ON_CUSTOMER`; hard bounce
  reopened the ticket to `OPEN`. A repeated Bounce returned `duplicate` (one `EMAIL_BOUNCED`).
- Complaint: documented `SpamComplaint` fixture POST against the VSS-1003 outbound MessageID (not a
  real mailbox spam click). Message became `SPAM_COMPLAINT` with `complainedAt`. A retry returned
  `duplicate` (one `EMAIL_COMPLAINT`). Future automated follow-up suppression UI is still not built.

## Inbound email

```
customer → support address → Postmark inbound stream → POST /api/support/inbound-email
         → SupportContact → SupportTicket (existing or new) → INBOUND SupportTicketMessage
```

Code: `src/lib/support/inbound-email.ts` (payload parsing, pure), `inbound-service.ts` (database),
`inbound-webhook.ts` (HTTP), `src/app/api/support/inbound-email/route.ts`.

### Webhook security and responses

The route is public in the platform registry (no Harbor or facility session is read). It requires
HTTP Basic Auth matching `POSTMARK_INBOUND_WEBHOOK_USERNAME` / `POSTMARK_INBOUND_WEBHOOK_PASSWORD`,
compared through SHA-256 digests with `timingSafeEqual`. Postmark does not sign inbound webhooks.
Deployments must serve it over HTTPS only. IP allowlisting is not implemented: the app cannot
reliably see Postmark's address behind the hosting proxy, and `x-forwarded-for` is not trusted. If the
hosting platform's firewall can restrict the path to Postmark's published inbound IPs, configure it
there.

| Situation | Response | Writes |
|-----------|----------|--------|
| Processed (new ticket or reply) | 200 | yes |
| Duplicate Postmark `MessageID` | 200 | none |
| Mail from Vssyl's own addresses | 200 (`ignored`) | none |
| Missing or wrong credentials | 401 (Postmark retries) | none |
| Malformed JSON, no `MessageID` or sender, or body over 50 MB | 403 (Postmark stops retrying) | none |
| Credentials not configured | 503 (Postmark retries) | none |
| Database or other failure | 500 (Postmark retries) | rolled back |

Postmark retries every non-200 response up to 10 times over about 10 hours, except 403. Retrying a
payload that can never parse only delays the failure, so permanent rejections return 403; the message
still shows as an Inbound Error in Postmark and can be retried manually once fixed. Auth failures stay
401 so mail queued during a credential rotation is delivered once the credentials match again.

Logs carry the Postmark `MessageID`, ticket id and number, message id, routing, duplicate flag, and
result. They never include bodies, the reply token, the Authorization header, or the password.

### Payload

Only these Postmark fields are read: `MessageID`, `From`, `FromName`, `FromFull`, `To`, `ToFull`,
`Cc`, `CcFull`, `ReplyTo`, `Subject`, `Date`, `MailboxHash`, `TextBody`, `HtmlBody`,
`StrippedTextReply`, `Headers`, `Attachments` (metadata), `OriginalRecipient`. All are optional except
`MessageID` and a sender address. The rest of the payload is discarded.

`Headers` is stored as `inboundHeaders` (`[{ name, value }]`, at most 200, values capped). That
includes Postmark's SpamAssassin headers (`X-Spam-Status`, `X-Spam-Score`, `X-Spam-Tests`). Header
names are matched case-insensitively. `Message-ID`, `In-Reply-To`, and `References` are also stored as
`internetMessageId`, `inReplyTo`, and `references`, without angle brackets.

### Contact

The sender address is normalized (trim, lowercase) and upserted as a `SupportContact` using the same
rule as Console-created tickets: it links to a `User` (and that user's facility) only when exactly one
active, verified user has the address. The link labels the contact for staff and grants nothing. The
message keeps the actual sender in `fromEmail` / `fromName` and its own `contactId`, so a colleague
replying on a ticket is shown as "Not the ticket's requester". Unknown senders are normal.

### Routing order

1. **Reply token.** `MailboxHash` (and the hashes on `ToFull` / `CcFull`) that look like a token are
   matched against `SupportTicket.replyToken`. This is authoritative: any sender holding the token
   reaches the ticket. Malformed or unknown tokens fall through.
2. **`In-Reply-To`**, then **`References`**, matched against stored `internetMessageId`. Used only
   when exactly one ticket matches.
3. **`[VSS-n]` in the subject.** Weak: used only when exactly one marker is present, the ticket exists,
   and the sender is that ticket's own requester contact.
4. **New ticket.**

A match on a `CLOSED` ticket (from any rule) does not reopen it. A new ticket is opened instead, and
its `CREATED` event metadata carries `previousTicketId` / `previousTicketNumber`.

The reply token is the primary mechanism, so routing works even if Postmark replaces our outbound
`Message-ID`.

### New tickets

Status `NEW`, type unset, priority `NORMAL`, unassigned. Facility comes from the contact (null when
unknown). The subject is the email subject with leading `Re:` / `Fwd:` style prefixes and stale
`[VSS-n]` markers removed, capped at 200 characters, or `(No subject)`. A `CREATED` event with no
actor and metadata `{ source: "EMAIL", providerMessageId, facilityId }` is written in the same
transaction.

### Replies on existing tickets

| Ticket status | Customer reply |
|---------------|----------------|
| NEW | stays NEW (no staff action is implied) |
| OPEN | stays OPEN |
| WAITING_ON_CUSTOMER | → OPEN |
| RESOLVED | → OPEN, `resolvedAt` cleared |
| CLOSED | not reopened; a follow-up ticket is created |

Reopening writes `STATUS_CHANGED` with no actor and `causedByMessageId` set to the inbound message.
Every inbound message also sets the ticket's `updatedAt`, so it rises in the Console queues. The
message, any reopening, and the `updatedAt` change commit together.

### Message body

Stored as received: `bodyText` (`TextBody`), `bodyHtml` (raw `HtmlBody`, for troubleshooting only),
`strippedReplyText` (`StrippedTextReply`). Console shows the stripped reply, else the text body, else
text derived from the HTML with every tag removed. Inbound HTML is never rendered as markup.

### Attachments

Ownership: ticket → inbound message → `SupportTicketAttachment`. Files are never attached directly
to the ticket. `attachmentManifest` still records `name`, `contentType`, `contentLength`, and
`contentId` on the message. Base64 contents are never written to Postgres.

Storage: private object storage (`@vercel/blob` with `access: "private"` when
`BLOB_READ_WRITE_TOKEN` is set). Object keys look like `support/{ticketId}/{messageId}/{attachmentId}`
and are never shown in Console or returned to customers. Facility `Attachment` / local `uploads/`
are not used.

Limits: 10 MB decoded per file. The inbound webhook still rejects bodies over 50 MB (Postmark's
own cap is 35 MB). An oversized, unreadable, or blocked file does not fail the email: the message
is kept and the attachment row is `BLOCKED` with a reason.

Types: reported MIME and filename are recorded, but extensions are not trusted. HTML, SVG, scripts,
and common executables are blocked from storage. Downloads always use `Content-Disposition:
attachment` and `application/octet-stream`. Inbound HTML is still not rendered.

Scan status: `PENDING`, `CLEAN`, `BLOCKED`, `SCAN_FAILED`.

**An attachment is never downloadable merely because it was successfully stored. It must receive a
real `CLEAN` scan result.** Stored files stay `PENDING` until a real malware scanner returns a
result. Do not treat `PENDING` as clean. No code path may mark `CLEAN` without a scanner result.

Malware scanning is **not implemented**. Slice 2B stopped after the runtime audit rather than
improvising a vendor or a dedicated worker. See [Malware scanning](#malware-scanning).

Download: `GET /api/console/support-attachments/{id}` after `getHarborSession()`. Only `CLEAN` is
streamed. `PENDING`, `BLOCKED`, and `SCAN_FAILED` are denied and never expose a blob URL. Facility
sessions receive 403; anonymous callers receive 401. Guessing an id is not authorization. Downloads
use `Content-Disposition: attachment` and `application/octet-stream` with a sanitized filename.

Retries: `providerMessageId` remains the message idempotency key. Attachments use
`(messageId, position)`. A Postmark retry does not create a second message or second attachment
row. If the message committed and storage did not, the retry completes the missing rows.

Lifecycle: support history is append-only. The app does not delete tickets, messages, or stored
objects. A manual row delete would orphan the object; there is no retention job yet.

Outbound staff attachments are deferred. Previews are deferred.

## Malware scanning

Vssyl does not yet scan stored support attachments. The inbound webhook stores a private object,
writes `scanStatus = PENDING`, and returns 200. Harbor cannot download the file until a future
scanner sets `CLEAN`.

### Why scanning is not in the inbound webhook

`POST /api/support/inbound-email` is a default Node.js route (not Edge). There is no
`export const runtime` or `maxDuration`. Fluid Compute defaults are about 300s and 2 GB. Postmark
retries every non-200 except 403. A synchronous scanner call would make Postmark wait, and a
timeout or 5xx would replay the whole inbound payload. Attachment persistence is already
idempotent, but scanner latency must not become inbound retry pressure.

`after()` / `waitUntil` can continue work after 200, but they are best-effort and not a durable
queue. Vssyl has no cron (`vercel.json` is absent), no Inngest/workflow/job worker, and no runtime
outside Vercel. Support “queues” are Console list filters. The offline queue is client IndexedDB.

### Options considered

| Class | Approach | Verdict |
|-------|----------|---------|
| A | Managed private malware-scanning API. Vercel uploads/streams the private object to the vendor and maps clean / infected / error. | Smallest fit for the current Vercel-only runtime, **if** a B2B vendor is contracted. File bytes leave Vercel. Requires an API key, DPA, and retention review. |
| B | Dedicated ClamAV (or equivalent) worker on a persistent host. Vercel invokes it asynchronously. | Compatible with large binaries and private data, but it is a new service, image, virus-definition updates, and on-call surface. |
| C | Storage-native scanning on Vercel Blob / Neon. | Not available. Vercel Blob has no malware scanner. |

Rejected: VirusTotal and any consumer/research service whose normal behavior publishes or broadly
shares samples. Do not create public blob URLs for scanning.

### Recommended architecture when a vendor is chosen

Do not scan inside the inbound webhook. Keep this lifecycle:

```
Inbound email
  → private Blob put
  → SupportTicketAttachment scanStatus = PENDING
  → 200 to Postmark
  → support-specific PENDING processor (Vercel Cron is enough; do not build a generic job platform)
  → SupportAttachmentScanner.scan({ attachmentId, storageKey, contentType, filename, sizeBytes, checksumSha256 })
  → CLEAN | BLOCKED | SCAN_FAILED
```

Provider logic stays behind `SupportAttachmentScanner`. Do not put vendor code in inbound-email
parsing, `SupportTicketMessage`, or Console UI.

Allowed transitions: `PENDING → CLEAN | BLOCKED | SCAN_FAILED`. An explicit re-scan may move
`SCAN_FAILED → PENDING` and then to a new result. Never silently convert `BLOCKED → CLEAN`.

Retry: three attempts with bounded backoff, then `SCAN_FAILED`. Infected (`BLOCKED`) does not
retry. Scanner outage must not fail the inbound webhook or loop Postmark. Two workers on the same
attachment must be idempotent (claim the row before scanning). Persist `scannedAt`, a provider
identifier, a short result code, and a failure reason — not secrets or raw vendor payloads.

Recovery while the scanner is unavailable: inbound mail and tickets continue; attachments remain
`PENDING` or become `SCAN_FAILED` after bounded retries; Harbor sees “Security scan pending” or
“Unavailable — security scan failed”; downloads stay denied. Re-ingestion from Postmark is not
required: the processor discovers existing `PENDING` rows.

Slice 2B did not install a vendor because that is a new infrastructure and data-processing
decision (account, secret, DPA, cost). Implement the adapter only after that choice is made.

## Private Blob

Production store: `ltc-manager-private` (`store_WvnKrZ5UUUsYvWLq`) in `iad1`. Access is **private**.
Base host is on `private.blob.vercel-storage.com`. `BLOB_READ_WRITE_TOKEN` is bound to Production
and Preview. Development is intentionally unset so local Next.js keeps using `.env`
(`127.0.0.1/ltc_manager`) and tests keep using the in-memory store.

`@vercel/blob` `^2.8.0` puts and gets with `access: "private"`. Keys are
`support/{ticketId}/{messageId}/{attachmentId}`. Blobs are never public and URLs are never shown.

A new production deploy is required before the running app sees the token. Local `.env.local`
must not override `DATABASE_URL` with Neon.

## Production migration

`20261003140000_support_ticket_attachment` is additive only (`CREATE TYPE`, `CREATE TABLE`,
indexes, FK). It was applied once with `prisma migrate deploy` to Neon host
`ep-plain-salad-avjht24p` / database `neondb` (pooler host
`ep-plain-salad-avjht24p-pooler`). Existing support rows stayed intact (2 tickets, 4 messages, 2
contacts). No attachment rows existed before or immediately after the migration. Do not
`migrate dev`, reset, `db push`, or drop to “fix” this.

### Idempotency

The Postmark `MessageID` is stored as the inbound message's `providerMessageId`, which is unique. A
repeat delivery finds it and returns `duplicate` with no new ticket, message, or event. Concurrent
deliveries race on the unique index: the loser's transaction rolls back entirely and it reports the
winner as a duplicate (2xx). The same email delivered to two Vssyl addresses (two Postmark ids, one
RFC `Message-ID` from the same sender) is also treated as a duplicate. That secondary check is not
backed by a constraint.

### Loops and automatic mail

- Mail whose sender is `SUPPORT_FROM_EMAIL`, `POSTMARK_FROM_EMAIL`, or `support+…@` on the reply
  domain is ignored (200, nothing stored).
- Mail marked `Auto-Submitted` (anything but `no`), `Precedence: bulk|junk|list|auto_reply`,
  `X-Autoreply`, or `X-Autorespond` is recorded but never changes ticket status. Console labels it
  "Automatic reply".
- Vssyl never sends email in response to inbound mail. There is no acknowledgment email.
- Spam is not filtered automatically. Messages Postmark marks `X-Spam-Status: Yes` are labeled in
  Console; staff close them.

## Message-ID: not yet verified

Postmark documents that it replaces `Message-ID` unless `X-PM-KeepID: true` is set; that is
documented for SMTP. Whether the template API honors it has **not** been verified. Threading does
not depend on it (the reply token does). Check it with a real token:

```
POSTMARK_SERVER_TOKEN=... npm run verify:postmark-message-id -- you@example.com
```

The script sends one email, reads the raw message from Postmark, and fails if the `Message-ID`
was replaced.

## External configuration

### Postmark

1. In the Postmark server, use (or create) the **Inbound** message stream.
2. Set its webhook URL to `https://{username}:{password}@{app host}/api/support/inbound-email`, using
   the values of `POSTMARK_INBOUND_WEBHOOK_USERNAME` / `PASSWORD`. Leave "Include raw email content"
   off.
3. Set the stream's **inbound domain** to the dedicated subdomain (for example
   `reply.vssyl.com`). Set `SUPPORT_REPLY_ADDRESS` to an address on it (`support@reply.vssyl.com`).
4. Verify the support sender (`SUPPORT_FROM_EMAIL`) as a sender signature or verified domain.
5. Template `console-ticket-reply`: **Subject** must be exactly `{{subject}}`. Other model fields:
   `display_name`, `facility_name`, `ticket_number`, `ticket_subject`, `reply_html`, `reply_text`.
6. Customer intake is **outside the app**: Google Workspace (or the current `vssyl.com` mailbox
   host) accepts `support@vssyl.com` and forwards it to the Postmark inbound address. Vssyl only
   receives the webhook. Do not publish `support@reply.vssyl.com` to customers.
7. On the **outbound** message stream → Webhooks: add
   `https://{POSTMARK_OUTBOUND_WEBHOOK_USERNAME}:{POSTMARK_OUTBOUND_WEBHOOK_PASSWORD}@vssyl.com/api/support/email-events`
   (or the same path with HTTP Basic Auth fields). Enable Delivery, Bounce, and Spam Complaint
   only. Do not reuse the inbound webhook URL or inbound Basic Auth unless you deliberately set
   the same values. Production was certified this way on 2026-10-03; Postmark Check/Test returned
   Verified for each enabled type.

### DNS

On the dedicated inbound subdomain only (never the root `vssyl.com`, which keeps its corporate MX):

| Type | Host | Value | Priority |
|------|------|-------|----------|
| MX | `{inbound subdomain}` (for example `reply`) | `inbound.postmarkapp.com` | 10 |

### Google Workspace (external)

Not application logic. Expected mail path:

```
support@vssyl.com
  → Google Workspace mailbox / group
  → forward to the Postmark inbound address
  → POST /api/support/inbound-email
  → SupportTicket
```

Manual checklist: create or confirm `support@vssyl.com`; forward to the Postmark inbound address;
complete Google’s forwarding confirmation; send a real test to `support@vssyl.com`; confirm a
ticket; reply from Console; confirm the customer Reply stays on that ticket.

### Secrets

`POSTMARK_SERVER_TOKEN`, `POSTMARK_INBOUND_WEBHOOK_USERNAME`, `POSTMARK_INBOUND_WEBHOOK_PASSWORD`,
`POSTMARK_OUTBOUND_WEBHOOK_USERNAME`, `POSTMARK_OUTBOUND_WEBHOOK_PASSWORD`.
Configuration: `POSTMARK_FROM_EMAIL`, `SUPPORT_FROM_EMAIL`, `SUPPORT_REPLY_ADDRESS`.
Attachment storage: `BLOB_READ_WRITE_TOKEN` (Vercel Blob, private, Production and Preview). Without
it, inbound mail is still recorded and attachment rows are stored as `BLOCKED` /
`STORAGE_UNAVAILABLE`. There is no malware-scanner secret yet; stored files remain `PENDING`.

## Not built yet

Malware scanner vendor and `SupportAttachmentScanner` processor (stored files remain `PENDING` and
non-downloadable), outbound attachments, attachment previews, retention/deletion automation,
acknowledgment emails, notification preferences and retention cleanup, time-based automation, SLAs,
teams and routing rules, AI classification, feature-request aggregation, customer portal, and chat.
