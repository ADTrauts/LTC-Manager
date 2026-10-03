import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addSupportTicketNoteAction,
  assignSupportTicketToMeAction,
  changeSupportTicketStatusAction,
  replySupportTicketAction,
  updateSupportTicketDetailsAction,
} from "@/app/console/(staff)/tickets/actions";
import { SupportSubmitButton } from "@/components/harbor-console/support-submit-button";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { getSupportFromAddress, isSupportReplyRoutingConfigured } from "@/lib/support/config";
import { isSupportTicketErrorCode, SUPPORT_TICKET_ERROR_MESSAGE } from "@/lib/support/errors";
import { newClientSubmissionId } from "@/lib/support/identifiers";
import { presentSupportAttachment } from "@/lib/support/attachment-presentation";
import { latestOutboundDeliveryWarning, presentOutboundDelivery } from "@/lib/support/delivery-presentation";
import {
  inboundDisplayBody,
  isAutoSubmitted,
  isPossibleSpam,
  readStoredHeaders,
} from "@/lib/support/inbound-email";
import {
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_PRIORITY_LABEL,
  SUPPORT_TICKET_STATUS_LABEL,
  SUPPORT_TICKET_TYPE_LABEL,
  SUPPORT_TICKET_TYPES,
} from "@/lib/support/labels";
import { allowedSupportTicketTransitions } from "@/lib/support/status-transition";
import { formatSupportTicketNumber } from "@/lib/support/ticket-number";
import {
  describeSupportEvent,
  mergeSupportTimeline,
  type SupportTimelineItem,
  type SupportTimelineMessage,
} from "@/lib/support/timeline";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm";

function formatTime(value: Date) {
  return value.toLocaleString("en-US", { timeZone: "America/New_York" });
}

export default async function ConsoleTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireHarborStaff();
  const [{ ticketId }, { error }] = await Promise.all([params, searchParams]);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      type: true,
      priority: true,
      createdAt: true,
      resolvedAt: true,
      closedAt: true,
      assignedStaffId: true,
      assignedStaff: { select: { displayName: true } },
      facilityId: true,
      facility: { select: { id: true, displayName: true } },
      contactId: true,
      contact: { select: { email: true, displayName: true, userId: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          kind: true,
          bodyText: true,
          bodyHtml: true,
          strippedReplyText: true,
          fromEmail: true,
          fromName: true,
          toEmails: true,
          receivedAt: true,
          contactId: true,
          inboundHeaders: true,
          attachments: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              filename: true,
              contentType: true,
              sizeBytes: true,
              scanStatus: true,
              rejectionReason: true,
            },
          },
          deliveryStatus: true,
          deliveryError: true,
          sentAt: true,
          deliveredAt: true,
          bounceType: true,
          bounceDescription: true,
          createdAt: true,
          authorStaff: { select: { displayName: true } },
          contact: { select: { email: true } },
        },
      },
      events: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          fromValue: true,
          toValue: true,
          metadata: true,
          causedByMessageId: true,
          createdAt: true,
          actorStaff: { select: { displayName: true } },
        },
      },
    },
  });
  if (!ticket) {
    notFound();
  }

  const [staff, facilities] = await Promise.all([
    prisma.platformStaff.findMany({
      where: { OR: [{ isActive: true }, ...(ticket.assignedStaffId ? [{ id: ticket.assignedStaffId }] : [])] },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, isActive: true },
    }),
    prisma.facility.findMany({
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
      take: 200,
    }),
  ]);
  if (ticket.facility && !facilities.some((row) => row.id === ticket.facility?.id)) {
    facilities.unshift(ticket.facility);
  }

  const timeline = mergeSupportTimeline(
    ticket.messages.map((message) => {
      const headers = message.kind === "INBOUND" ? readStoredHeaders(message.inboundHeaders) : [];
      return {
      id: message.id,
      kind: message.kind,
      bodyText: message.kind === "INBOUND" ? inboundDisplayBody(message) : message.bodyText,
      authorName: message.authorStaff?.displayName ?? null,
      contactEmail: message.contact?.email ?? null,
      fromEmail: message.fromEmail,
      toEmails: message.toEmails,
      deliveryStatus: message.deliveryStatus,
      deliveryError: message.deliveryError,
      sentAt: message.sentAt,
      deliveredAt: message.deliveredAt,
      bounceType: message.bounceType,
      bounceDescription: message.bounceDescription,
      createdAt: message.createdAt,
      fromName: message.fromName,
      receivedAt: message.receivedAt,
      fromRequester: message.kind !== "INBOUND" || message.contactId === ticket.contactId,
      attachments: message.attachments,
      autoSubmitted: isAutoSubmitted(headers),
      possibleSpam: isPossibleSpam(headers),
      };
    }),
    ticket.events.map((event) => ({
      id: event.id,
      type: event.type,
      actorName: event.actorStaff?.displayName ?? null,
      causedByMessageId: event.causedByMessageId,
      fromValue: event.fromValue,
      toValue: event.toValue,
      metadata: event.metadata,
      createdAt: event.createdAt,
    })),
  );

  const closed = ticket.status === "CLOSED";
  const deliveryWarning = latestOutboundDeliveryWarning(ticket.messages);
  const transitions = allowedSupportTicketTransitions(ticket.status);
  const replyDefault = transitions.includes("WAITING_ON_CUSTOMER") ? "WAITING_ON_CUSTOMER" : "";
  const ticketNumber = formatSupportTicketNumber(ticket.number);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-3">
        <p className="text-sm">
          <Link href="/console/tickets" className="text-[var(--text-secondary)] hover:underline">
            Tickets
          </Link>
        </p>
        <div>
          <p className="font-mono text-sm font-semibold text-[var(--text-secondary)]">{ticketNumber}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-[var(--border)] bg-white px-4 py-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <HeaderField label="Status" value={SUPPORT_TICKET_STATUS_LABEL[ticket.status]} strong />
          <HeaderField label="Priority" value={SUPPORT_TICKET_PRIORITY_LABEL[ticket.priority]} strong={ticket.priority === "HIGH" || ticket.priority === "URGENT"} />
          <HeaderField label="Type" value={ticket.type ? SUPPORT_TICKET_TYPE_LABEL[ticket.type] : "Unclassified"} />
          <HeaderField label="Assignee" value={ticket.assignedStaff?.displayName ?? "Unassigned"} />
          <div className="min-w-0">
            <dt className="text-xs text-[var(--text-secondary)]">Requester</dt>
            <dd className="truncate">
              {ticket.contact.displayName ? `${ticket.contact.displayName} · ` : ""}
              {ticket.contact.email}
            </dd>
            {ticket.contact.userId ? (
              <dd className="text-xs text-[var(--text-secondary)]">Matches a Vssyl user</dd>
            ) : null}
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--text-secondary)]">Facility</dt>
            <dd className="truncate">
              {ticket.facility ? (
                <Link href={`/console/customers/${ticket.facility.id}`} className="underline">
                  {ticket.facility.displayName}
                </Link>
              ) : (
                "No facility"
              )}
            </dd>
          </div>
        </dl>
      </header>

      {deliveryWarning ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {deliveryWarning}
        </p>
      ) : null}

      {isSupportTicketErrorCode(error) ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {SUPPORT_TICKET_ERROR_MESSAGE[error]}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="space-y-6">
          <ol className="space-y-3" aria-label="Ticket timeline">
            {timeline.map((item) => (
              <TimelineEntry key={`${item.kind}-${item.kind === "message" ? item.message.id : item.event.id}`} item={item} />
            ))}
          </ol>

          {closed ? (
            <p className="rounded-md border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--text-secondary)]">
              This ticket is closed. Closed tickets are final; internal notes can still be added.
            </p>
          ) : (
            <form action={replySupportTicketAction} className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <input type="hidden" name="clientSubmissionId" value={newClientSubmissionId()} />
              <label className="block text-sm">
                <span className="font-medium">Reply to customer</span>
                <textarea name="body" required maxLength={8000} rows={5} className={INPUT_CLASS} />
              </label>
              <p className="text-xs text-[var(--text-secondary)]">
                Emails {ticket.contact.email} from {getSupportFromAddress()}.{" "}
                {isSupportReplyRoutingConfigured()
                  ? "When the customer replies, it comes back to this ticket."
                  : "Reply routing isn't configured on this server, so customer replies won't reach Console."}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Status after reply</span>
                  <select name="status" defaultValue={replyDefault} className={INPUT_CLASS}>
                    <option value="">Keep {SUPPORT_TICKET_STATUS_LABEL[ticket.status]}</option>
                    {transitions.map((status) => (
                      <option key={status} value={status}>
                        {SUPPORT_TICKET_STATUS_LABEL[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <SupportSubmitButton pendingLabel="Sending…">Send reply</SupportSubmitButton>
              </div>
            </form>
          )}

          <form action={addSupportTicketNoteAction} className="space-y-3 rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--background)] p-4">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <input type="hidden" name="clientSubmissionId" value={newClientSubmissionId()} />
            <label className="block text-sm">
              <span className="font-medium">Internal note</span>
              <span className="ml-1 text-[var(--text-secondary)]">Only Vssyl staff see this. Never emailed.</span>
              <textarea name="body" required maxLength={8000} rows={3} className={`${INPUT_CLASS} bg-white`} />
            </label>
            <SupportSubmitButton pendingLabel="Saving…" variant="secondary">
              Add internal note
            </SupportSubmitButton>
          </form>
        </section>

        <aside className="space-y-4">
          <form action={changeSupportTicketStatusAction} className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
            <h2 className="text-sm font-semibold">Status</h2>
            <input type="hidden" name="ticketId" value={ticket.id} />
            {closed ? (
              <p className="text-sm text-[var(--text-secondary)]">Closed {ticket.closedAt ? formatTime(ticket.closedAt) : ""}</p>
            ) : (
              <>
                <select name="status" defaultValue={transitions[0]} className={INPUT_CLASS} aria-label="New status">
                  {transitions.map((status) => (
                    <option key={status} value={status}>
                      {SUPPORT_TICKET_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[var(--text-secondary)]">Changes status without emailing the customer.</p>
                <SupportSubmitButton pendingLabel="Saving…" variant="secondary">
                  Change status
                </SupportSubmitButton>
              </>
            )}
            {ticket.resolvedAt && !closed ? (
              <p className="text-xs text-[var(--text-secondary)]">Resolved {formatTime(ticket.resolvedAt)}</p>
            ) : null}
          </form>

          <form action={updateSupportTicketDetailsAction} className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
            <h2 className="text-sm font-semibold">Details</h2>
            <input type="hidden" name="ticketId" value={ticket.id} />
            <label className="block text-sm">
              <span className="font-medium">Assignee</span>
              <select name="assignedStaffId" defaultValue={ticket.assignedStaffId ?? ""} className={INPUT_CLASS}>
                <option value="">Unassigned</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id} disabled={!member.isActive}>
                    {member.displayName}
                    {member.id === session.uid ? " (me)" : ""}
                    {member.isActive ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Type</span>
              <select name="type" defaultValue={ticket.type ?? ""} className={INPUT_CLASS}>
                <option value="">Unclassified</option>
                {SUPPORT_TICKET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {SUPPORT_TICKET_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Priority</span>
              <select name="priority" defaultValue={ticket.priority} className={INPUT_CLASS}>
                {SUPPORT_TICKET_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {SUPPORT_TICKET_PRIORITY_LABEL[priority]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Facility</span>
              <select name="facilityId" defaultValue={ticket.facilityId ?? ""} className={INPUT_CLASS}>
                <option value="">No facility</option>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.displayName}
                  </option>
                ))}
              </select>
            </label>
            <SupportSubmitButton pendingLabel="Saving…" variant="secondary">
              Save details
            </SupportSubmitButton>
          </form>

          {ticket.assignedStaffId !== session.uid ? (
            <form action={assignSupportTicketToMeAction}>
              <input type="hidden" name="ticketId" value={ticket.id} />
              <SupportSubmitButton pendingLabel="Assigning…" variant="secondary">
                Assign to me
              </SupportSubmitButton>
            </form>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function HeaderField({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
      <dd className={strong ? "font-semibold" : undefined}>{value}</dd>
    </div>
  );
}

function TimelineEntry({ item }: { item: SupportTimelineItem }) {
  if (item.kind === "event") {
    return (
      <li className="flex gap-2 px-1 text-xs text-[var(--text-secondary)]">
        <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--border-strong)]" />
        <span>
          {describeSupportEvent(item.event)}
          {item.event.actorName ? ` · ${item.event.actorName}` : ""}
          {" · "}
          {formatTime(item.at)}
        </span>
      </li>
    );
  }
  return <MessageEntry message={item.message} />;
}

const DELIVERY_TONE = {
  neutral: "text-[var(--text-secondary)]",
  ok: "text-emerald-700",
  problem: "text-red-700",
} as const;

function MessageEntry({ message }: { message: SupportTimelineMessage }) {
  if (message.kind === "NOTE") {
    return (
      <li className="rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--background)] p-4">
        <p className="text-xs text-[var(--text-secondary)]">
          <span className="font-semibold uppercase tracking-wide text-[var(--foreground)]">Internal note</span>
          {" · "}
          {message.authorName ?? "Vssyl staff"}
          {" · "}
          {formatTime(message.createdAt)}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm">{message.bodyText}</p>
      </li>
    );
  }

  if (message.kind === "INBOUND") {
    const sender = message.fromEmail ?? message.contactEmail ?? "Unknown sender";
    const attachments = message.attachments ?? [];
    return (
      <li className="rounded-md border border-[var(--border)] border-l-4 border-l-sky-500 bg-sky-50/40 p-4">
        <p className="text-xs text-[var(--text-secondary)]">
          <span className="font-semibold uppercase tracking-wide text-[var(--foreground)]">Customer email</span>
          {" · "}
          <span className="text-[var(--foreground)]">{message.fromName ? `${message.fromName} <${sender}>` : sender}</span>
          {" · received "}
          {formatTime(message.receivedAt ?? message.createdAt)}
        </p>
        {message.fromRequester === false || message.autoSubmitted || message.possibleSpam ? (
          <p className="mt-1 flex flex-wrap gap-2 text-xs">
            {message.fromRequester === false ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">Not the ticket&apos;s requester</span>
            ) : null}
            {message.autoSubmitted ? (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">Automatic reply · status not changed</span>
            ) : null}
            {message.possibleSpam ? (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">Postmark flagged as possible spam</span>
            ) : null}
          </p>
        ) : null}
        <p className="mt-2 whitespace-pre-wrap text-sm">{message.bodyText || "(No message text)"}</p>
        {attachments.length > 0 ? (
          <div className="mt-3 rounded border border-[var(--border)] bg-white px-3 py-2 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Attachments</p>
            <ul className="mt-2 space-y-2">
              {attachments.map((attachment) => {
                const view = presentSupportAttachment(attachment);
                return (
                  <li key={view.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--foreground)]">{view.filename}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{view.detail}</p>
                    </div>
                    {view.downloadHref ? (
                      <a
                        href={view.downloadHref}
                        className="text-xs font-medium text-[var(--foreground)] underline-offset-2 hover:underline"
                      >
                        Download
                      </a>
                    ) : (
                      <p className="text-xs text-[var(--text-secondary)]">{view.statusLabel}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </li>
    );
  }

  const delivery = presentOutboundDelivery(message, formatTime);
  return (
    <li className="rounded-md border border-[var(--border)] border-l-4 border-l-[var(--run-aside)] bg-white p-4">
      <p className="text-xs text-[var(--text-secondary)]">
        <span className="font-semibold uppercase tracking-wide text-[var(--foreground)]">Vssyl reply</span>
        {" · "}
        {message.authorName ?? "Vssyl staff"}
        {message.toEmails.length > 0 ? ` · to ${message.toEmails.join(", ")}` : ""}
        {delivery.sentText ? (
          <>
            {" · "}
            <span className={delivery.tone === "problem" ? "" : DELIVERY_TONE.ok}>{delivery.sentText}</span>
          </>
        ) : null}
        {delivery.outcomeText ? (
          <>
            {" · "}
            <span className={`font-semibold ${DELIVERY_TONE[delivery.tone]}`}>{delivery.outcomeText}</span>
          </>
        ) : null}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{message.bodyText}</p>
      {message.deliveryStatus === "FAILED" && message.deliveryError ? (
        <p className="mt-2 text-xs text-red-700">Not delivered: {message.deliveryError}</p>
      ) : null}
      {delivery.detail ? (
        <p className={`mt-2 text-xs ${delivery.tone === "problem" ? "text-red-700" : "text-[var(--text-secondary)]"}`}>
          {delivery.detail}
        </p>
      ) : null}
    </li>
  );
}
