import Link from "next/link";
import { notFound } from "next/navigation";

import { replyConsoleTicketAction } from "@/app/console/(staff)/tickets/actions";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";

export default async function ConsoleTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  await requireHarborStaff();
  const { ticketId } = await params;
  const ticket = await prisma.consoleTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      subject: true,
      status: true,
      requesterEmail: true,
      requesterName: true,
      createdAt: true,
      facility: { select: { id: true, displayName: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          emailedAt: true,
          createdAt: true,
          authorStaff: { select: { displayName: true } },
        },
      },
    },
  });
  if (!ticket) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Ticket</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          <Link href={`/console/customers/${ticket.facility.id}`} className="underline">
            {ticket.facility.displayName}
          </Link>
          {" · "}
          {ticket.requesterName ? `${ticket.requesterName} · ` : ""}
          {ticket.requesterEmail}
        </p>
      </header>

      <ol className="space-y-3">
        {ticket.messages.map((message) => (
          <li key={message.id} className="rounded-md border border-[var(--border)] bg-white p-4">
            <p className="text-xs text-[var(--text-secondary)]">
              {message.authorStaff.displayName}
              {" · "}
              {message.createdAt.toLocaleString("en-US", { timeZone: "America/New_York" })}
              {message.emailedAt ? " · Emailed" : ""}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{message.body}</p>
          </li>
        ))}
      </ol>

      <form action={replyConsoleTicketAction} className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
        <input type="hidden" name="ticketId" value={ticket.id} />
        <label className="block text-sm">
          <span className="font-medium">Reply</span>
          <textarea
            name="body"
            required
            rows={5}
            className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Status after reply</span>
          <select
            name="status"
            defaultValue={ticket.status === "RESOLVED" ? "OPEN" : "WAITING_ON_CUSTOMER"}
            className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
          >
            <option value="OPEN">Open</option>
            <option value="WAITING_ON_CUSTOMER">Waiting on customer</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)]"
        >
          Send reply
        </button>
      </form>
    </div>
  );
}
