import Link from "next/link";

import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";

const STATUS_LABEL = {
  OPEN: "Open",
  WAITING_ON_CUSTOMER: "Waiting on customer",
  RESOLVED: "Resolved",
} as const;

export default async function ConsoleTicketsPage() {
  await requireHarborStaff();
  const tickets = await prisma.consoleTicket.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      subject: true,
      status: true,
      requesterEmail: true,
      updatedAt: true,
      facility: { select: { displayName: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Platform support for facilities. Replies email the requester.
          </p>
        </div>
        <Link
          href="/console/tickets/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)]"
        >
          New ticket
        </Link>
      </header>

      <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
            <tr>
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-4 py-2 font-medium">Facility</th>
              <th className="px-4 py-2 font-medium">Requester</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-[var(--text-secondary)]">
                  No tickets yet.
                </td>
              </tr>
            ) : (
              tickets.map((ticket) => (
                <tr key={ticket.id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-4 py-3">
                    <Link href={`/console/tickets/${ticket.id}`} className="font-medium hover:underline">
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{ticket.facility.displayName}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{ticket.requesterEmail}</td>
                  <td className="px-4 py-3">{STATUS_LABEL[ticket.status]}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
