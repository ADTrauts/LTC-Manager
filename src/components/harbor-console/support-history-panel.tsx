import Link from "next/link";

import { SUPPORT_TICKET_STATUS_LABEL } from "@/lib/support/labels";
import {
  supportContactHref,
  type SupportFacilityHistory,
  type SupportHistoryCounts,
  type SupportHistoryTicketRow,
} from "@/lib/support/history";
import { formatSupportTicketNumber } from "@/lib/support/ticket-number";

function formatHistoryDate(value: Date) {
  return value.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatHistoryUpdated(value: Date) {
  return value.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function RecentTickets({
  tickets,
  showRequester,
}: {
  tickets: Array<SupportHistoryTicketRow & { contact?: { id: string; email: string; displayName: string | null } }>;
  showRequester?: boolean;
}) {
  return (
    <ul className="mt-3 divide-y divide-[var(--border)]">
      {tickets.map((ticket) => (
        <li key={ticket.id} className="py-2">
          <Link href={`/console/tickets/${ticket.id}`} className="block hover:underline">
            <p className="font-mono text-xs text-[var(--text-secondary)]">
              {formatSupportTicketNumber(ticket.number)}
            </p>
            <p className="text-sm font-medium">{ticket.subject}</p>
          </Link>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {SUPPORT_TICKET_STATUS_LABEL[ticket.status]} · Updated {formatHistoryUpdated(ticket.updatedAt)}
          </p>
          {showRequester && ticket.contact ? (
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              <Link href={supportContactHref(ticket.contact.id)} className="hover:underline">
                {ticket.contact.displayName || ticket.contact.email}
              </Link>
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function SupportHistoryPanel({
  title = "Support",
  empty,
  counts,
  lastLabel,
  lastAt,
  recent,
  viewAllHref,
  viewAllLabel,
  extraCounts,
  showRequester,
}: {
  title?: string;
  empty: string;
  counts: SupportHistoryCounts;
  lastLabel?: string;
  lastAt?: Date | null;
  recent: Array<SupportHistoryTicketRow & { contact?: { id: string; email: string; displayName: string | null } }>;
  viewAllHref: string;
  viewAllLabel: string;
  extraCounts?: Array<{ label: string; value: number }>;
  showRequester?: boolean;
}) {
  return (
    <section className="rounded-md border border-[var(--border)] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {counts.total > 0 ? (
          <Link href={viewAllHref} className="text-sm text-[var(--text-secondary)] hover:underline">
            {viewAllLabel}
          </Link>
        ) : null}
      </div>
      {counts.total === 0 ? (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{empty}</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Count label="Active" value={counts.active} />
            <Count label="Waiting on customer" value={counts.waitingOnCustomer} />
            <Count label="Resolved" value={counts.resolved} />
            {extraCounts?.map((row) => (
              <Count key={row.label} label={row.label} value={row.value} />
            ))}
            {lastLabel && lastAt ? (
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">{lastLabel}</dt>
                <dd className="mt-0.5 text-sm">{formatHistoryDate(lastAt)}</dd>
              </div>
            ) : null}
          </dl>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Recent tickets
          </h3>
          <RecentTickets tickets={recent} showRequester={showRequester} />
        </>
      )}
    </section>
  );
}
