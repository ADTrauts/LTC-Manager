import Link from "next/link";

import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import {
  SUPPORT_TICKET_PRIORITY_LABEL,
  SUPPORT_TICKET_STATUS_LABEL,
  SUPPORT_TICKET_TYPE_LABEL,
} from "@/lib/support/labels";
import { parseSupportQueue, SUPPORT_QUEUES, supportQueueWhere } from "@/lib/support/queues";
import { formatSupportTicketNumber } from "@/lib/support/ticket-number";

const LIST_LIMIT = 100;

function formatUpdated(value: Date) {
  return value.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ConsoleTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string }>;
}) {
  const session = await requireHarborStaff();
  const queue = parseSupportQueue((await searchParams).queue);

  const [tickets, counts] = await Promise.all([
    prisma.supportTicket.findMany({
      where: supportQueueWhere(queue, session.uid),
      orderBy: { updatedAt: "desc" },
      take: LIST_LIMIT,
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        type: true,
        priority: true,
        updatedAt: true,
        contact: { select: { email: true, displayName: true } },
        facility: { select: { displayName: true } },
        assignedStaff: { select: { displayName: true } },
      },
    }),
    Promise.all(
      SUPPORT_QUEUES.map((row) =>
        prisma.supportTicket.count({ where: supportQueueWhere(row.key, session.uid) }),
      ),
    ),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Customer support for Vssyl. Replies are emailed to the requester; internal notes stay in Console.
          </p>
        </div>
        <Link
          href="/console/tickets/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)]"
        >
          New ticket
        </Link>
      </header>

      <nav aria-label="Ticket queues" className="flex flex-wrap gap-1">
        {SUPPORT_QUEUES.map((row, index) => {
          const active = row.key === queue;
          return (
            <Link
              key={row.key}
              href={row.key === "all" ? "/console/tickets" : `/console/tickets?queue=${row.key}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                active
                  ? "border-[var(--run-aside)] bg-[var(--run-aside)] font-semibold text-[var(--run-aside-fg)]"
                  : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:text-[var(--foreground)]"
              }`}
            >
              {row.label}
              <span className="ml-1.5 tabular-nums opacity-70">{counts[index]}</span>
            </Link>
          );
        })}
      </nav>

      <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
            <tr>
              <th className="px-4 py-2 font-medium">Ticket</th>
              <th className="px-4 py-2 font-medium">Requester</th>
              <th className="px-4 py-2 font-medium">Facility</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Priority</th>
              <th className="px-4 py-2 font-medium">Assignee</th>
              <th className="px-4 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-[var(--text-secondary)]">
                  No tickets in this queue.
                </td>
              </tr>
            ) : (
              tickets.map((ticket) => (
                <tr key={ticket.id} className="border-b border-[var(--border)] align-top last:border-b-0">
                  <td className="px-4 py-3">
                    <Link href={`/console/tickets/${ticket.id}`} className="font-medium hover:underline">
                      <span className="mr-2 font-mono text-xs text-[var(--text-secondary)]">
                        {formatSupportTicketNumber(ticket.number)}
                      </span>
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {ticket.contact.displayName ? (
                      <>
                        <span className="text-[var(--foreground)]">{ticket.contact.displayName}</span>
                        <br />
                      </>
                    ) : null}
                    {ticket.contact.email}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{ticket.facility?.displayName ?? "—"}</td>
                  <td className="px-4 py-3">{SUPPORT_TICKET_STATUS_LABEL[ticket.status]}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {ticket.type ? SUPPORT_TICKET_TYPE_LABEL[ticket.type] : "Unclassified"}
                  </td>
                  <td className={`px-4 py-3 ${ticket.priority === "URGENT" || ticket.priority === "HIGH" ? "font-semibold" : "text-[var(--text-secondary)]"}`}>
                    {SUPPORT_TICKET_PRIORITY_LABEL[ticket.priority]}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {ticket.assignedStaff?.displayName ?? "Unassigned"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                    {formatUpdated(ticket.updatedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {tickets.length === LIST_LIMIT ? (
        <p className="text-xs text-[var(--text-secondary)]">Showing the {LIST_LIMIT} most recently updated tickets.</p>
      ) : null}
    </div>
  );
}
