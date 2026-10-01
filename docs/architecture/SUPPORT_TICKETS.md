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
  only carries outbound replies (and, from Slice 2, inbound mail).
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
| Reply token | 40 lowercase hex chars, unique, never shown in the UI. Reserved for inbound routing. |

Status transitions (`src/lib/support/status-transition.ts`):

| From | To |
|------|----|
| NEW | OPEN, WAITING_ON_CUSTOMER, RESOLVED, CLOSED |
| OPEN | WAITING_ON_CUSTOMER, RESOLVED, CLOSED |
| WAITING_ON_CUSTOMER | OPEN, RESOLVED, CLOSED |
| RESOLVED | OPEN, CLOSED |
| CLOSED | — (final) |

Entering `RESOLVED` sets `resolvedAt`; reopening clears it. Entering `CLOSED` sets `closedAt`.
Staff-opened tickets start `OPEN`; `NEW` is for customer-originated mail (Slice 2).

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

1. Transaction: insert the `OUTBOUND` message as `PENDING` (with a generated RFC `Message-ID`),
   apply any status change, touch `updatedAt`. A repeated `clientSubmissionId` returns the first
   message and sends nothing.
2. After commit, send through Postmark template `console-ticket-reply` with `Message-ID`,
   `X-PM-KeepID: true`, and Metadata `supportTicketId`, `supportTicketNumber`, `supportMessageId`.
3. Mark `SENT` (with `providerMessageId`, `sentAt`) or `FAILED` (with a readable `deliveryError`).
   Messages are never deleted; a failed reply stays on the timeline.

`providerMessageId` and `clientSubmissionId` are unique. `internetMessageId` is indexed but not
unique, because inbound mail may repeat IDs.

No `Reply-To` is set yet. Replies go out from `EMAIL_FROM` (currently `noreply@vssyl.com`), and the
Console shows that customer replies do not reach Console yet.

## Message-ID: not yet verified

Postmark documents that it replaces `Message-ID` unless `X-PM-KeepID: true` is set; that is
documented for SMTP. Whether the template API honors it has **not** been verified. Until it is,
do not depend on `internetMessageId` for threading. Check it with a real token:

```
POSTMARK_SERVER_TOKEN=... EMAIL_FROM=... npm run verify:postmark-message-id -- you@example.com
```

The script sends one email, reads the raw message from Postmark, and fails if the `Message-ID`
was replaced.

## Required Postmark dashboard change

The app sends the tagged subject (`[VSS-1001] Cooler logs not saving`) as the template model field
`subject`. In Postmark, the `console-ticket-reply` template's **Subject** must be exactly
`{{subject}}`. Other model fields: `display_name`, `facility_name`, `ticket_number`,
`ticket_subject`, `reply_html`, `reply_text`.

## Not in Slice 1

Inbound email and its webhook, `Reply-To` routing, attachments, customer portal, chat, SLAs,
teams, automation, and AI.
