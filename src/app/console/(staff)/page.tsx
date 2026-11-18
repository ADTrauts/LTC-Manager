import Link from "next/link";

import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { harborCustomersHref } from "@/lib/harbor-console/presentation";
import { loadHarborToday } from "@/lib/harbor-console/queries";
import { prisma } from "@/lib/prisma";
import { ACTIVE_SUPPORT_STATUSES } from "@/lib/support/queues";
import { formatSupportTicketNumber } from "@/lib/support/ticket-number";

export default async function HarborTodayPage() {
  await requireHarborStaff();
  const [{ setupFollowUp, paymentProblems }, openTickets, newTickets] = await Promise.all([
    loadHarborToday(prisma),
    prisma.supportTicket.count({
      where: { status: { in: ACTIVE_SUPPORT_STATUSES } },
    }),
    prisma.supportTicket.findMany({
      where: { status: "NEW" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, number: true, subject: true, contact: { select: { email: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Guided setup follow-up, open tickets, and payment problems.
        </p>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <Stat value={String(setupFollowUp.total)} label="Awaiting setup acknowledgment" />
        <Stat value={String(openTickets)} label="Open tickets" />
        <Stat value={String(paymentProblems.length)} label="Payment problems" />
      </section>

      <Queue
        title="New tickets"
        empty="No new tickets."
        rows={newTickets.map((row) => ({
          href: `/console/tickets/${row.id}`,
          title: `${formatSupportTicketNumber(row.number)} · ${row.subject}`,
          detail: row.contact.email,
        }))}
      />
      <Queue
        title="Guided setup follow-up"
        empty="No facilities are awaiting setup acknowledgment."
        followUp={harborCustomersHref({ setup: "awaiting" })}
        summary={setupFollowUp.total > setupFollowUp.rows.length ? `Showing ${setupFollowUp.rows.length} of ${setupFollowUp.total} facilities awaiting acknowledgment.` : undefined}
        rows={setupFollowUp.rows.map((row) => ({
          href: `/console/customers/${row.id}`,
          title: row.displayName,
          detail: `${row.organizationName} · ${row.onboarding}`,
        }))}
      />
      <Queue
        title="Payment problems"
        empty="No past-due or incomplete billing."
        rows={paymentProblems.map((row) => ({
          href: `/console/customers/${row.id}`,
          title: row.displayName,
          detail: `${row.billingStatus} · ${row.licensedDepartments.join(", ") || "No licensed departments"}`,
        }))}
      />
    </div>
  );
}

function Stat({ value, label, muted }: { value: string; label: string; muted?: boolean }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-white px-4 py-3">
      <p className={`text-2xl font-semibold ${muted ? "text-[var(--text-muted)]" : "text-[var(--brand-accent)]"}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}

function Queue({
  title,
  empty,
  rows,
  followUp,
  summary,
}: {
  title: string;
  empty: string;
  rows: Array<{ href: string; title: string; detail: string }>;
  followUp?: string;
  summary?: string;
}) {
  return (
    <section className="rounded-md border border-[var(--border)] bg-white">
      <h2 className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--text-secondary)]">{empty}</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.href} className="border-b border-[var(--border)] last:border-b-0">
              <Link href={row.href} className="block px-4 py-3 hover:bg-[var(--brand-accent-soft)]">
                <p className="text-sm font-medium">{row.title}</p>
                <p className="text-xs text-[var(--text-secondary)]">{row.detail}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {followUp ? (
        <div className="flex flex-wrap items-center gap-x-4 border-t border-[var(--border)] px-4 text-sm">
          {summary ? <p className="text-xs text-[var(--text-secondary)]">{summary}</p> : null}
          <Link href={followUp} className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">
            View setup follow-up in Customers
          </Link>
        </div>
      ) : null}
    </section>
  );
}
