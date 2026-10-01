# Support tickets

Canonical support domain for Vssyl Console. Code: `src/lib/support/`. Schema: `SupportContact`,
`SupportTicket`, `SupportTicketMessage`, `SupportTicketEvent` in `prisma/schema.prisma`.

## Ownership and boundaries

- Support tickets belong to **Vssyl Console** (`/console/tickets`), worked by `PlatformStaff`.
  Every Console server action calls `requireHarborStaff()` first; facility sessions never reach
  Console.
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
   Messages are never deleted; a failed reply stays on the timeline.

`providerMessageId` and `clientSubmissionId` are unique. `internetMessageId` is indexed but not
unique, because inbound mail may repeat IDs.

Sender: `SUPPORT_FROM_EMAIL` (for example `Vssyl Support <support@vssyl.com>`), falling back to
`POSTMARK_FROM_EMAIL`. Other transactional email keeps `POSTMARK_FROM_EMAIL`.

Reply-To: `support+{replyToken}@{inbound domain}`, built from `SUPPORT_REPLY_ADDRESS`. It is set only
when `SUPPORT_REPLY_ADDRESS` and both inbound webhook credentials are configured, so replies are
never routed to an address nobody receives. The token appears in email headers by necessity; Console
never shows it.

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
| Missing or wrong credentials | 401 | none |
| Malformed JSON | 400 | none |
| Valid JSON but no `MessageID` or sender | 422 | none |
| Credentials not configured | 503 | none |
| Database or other failure | 500 (Postmark retries) | rolled back |

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

Not stored. `attachmentManifest` records `name`, `contentType`, `contentLength`, and `contentId` for
each attachment. Base64 contents are never written. Console lists the files and says storage isn't
enabled. File storage and malware scanning are a later slice.

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
6. Customer intake: forward `support@vssyl.com` (in the existing mail provider) to the inbound
   address, or publish the inbound address directly.

### DNS

On the dedicated inbound subdomain only (never the root `vssyl.com`, which keeps its corporate MX):

| Type | Host | Value | Priority |
|------|------|-------|----------|
| MX | `{inbound subdomain}` (for example `reply`) | `inbound.postmarkapp.com` | 10 |

### Secrets

`POSTMARK_SERVER_TOKEN`, `POSTMARK_INBOUND_WEBHOOK_USERNAME`, `POSTMARK_INBOUND_WEBHOOK_PASSWORD`.
Configuration: `POSTMARK_FROM_EMAIL`, `SUPPORT_FROM_EMAIL`, `SUPPORT_REPLY_ADDRESS`.

## Not built yet

Attachment storage and malware scanning, acknowledgment emails, delivery/bounce/spam-complaint
webhooks, staff notifications, SLAs, teams and routing rules, AI classification, feature-request
aggregation, customer portal, and chat.
