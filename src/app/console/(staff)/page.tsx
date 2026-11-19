import Link from "next/link";

import { peekHarborWorkFacilityId, requireHarborStaff } from "@/lib/harbor-console/auth";
import { harborCustomersHref } from "@/lib/harbor-console/presentation";
import { loadHarborToday, loadHarborUnassignedImplementation, loadHarborAssignedImplementation } from "@/lib/harbor-console/queries";
import { HARBOR_WORK_CLEANUP_PATH } from "@/lib/harbor-console/session";
import { prisma } from "@/lib/prisma";
import { ACTIVE_SUPPORT_STATUSES } from "@/lib/support/queues";
import { formatSupportTicketNumber } from "@/lib/support/ticket-number";

export default async function HarborTodayPage() {
  const session = await requireHarborStaff();
  const workFacilityId = await peekHarborWorkFacilityId();
  const actor = { kind: "staff" as const, session, workFacilityId };
  const [{ setupFollowUp, paymentFollowUp }, unassigned, assigned, openTickets, newTickets] = await Promise.all([
    loadHarborToday(prisma),
    workFacilityId ? null : loadHarborUnassignedImplementation(prisma, actor),
    workFacilityId ? null : loadHarborAssignedImplementation(prisma, actor),
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
          Implementation requests, guided setup follow-up, open tickets, and payment problems.
        </p>
        <Link href="/console/operations" prefetch={false} className="mt-2 inline-block text-sm underline underline-offset-2">
          Review operations exceptions and recorded job evidence
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={unassigned ? String(unassigned.total) : "Unavailable"} label="Unassigned Implementation requests" muted={!unassigned} />
        <Stat value={String(setupFollowUp.total)} label="Awaiting setup acknowledgment" />
        <Stat value={String(openTickets)} label="Open tickets" />
        <Stat value={String(paymentFollowUp.total)} label="Payment problems" />
      </section>

      <ImplementationQueue work="assigned" data={assigned} />
      <ImplementationQueue work="unassigned" data={unassigned} />
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
        empty="No payment problems recorded in the local billing mirror."
        followUp="/console/operations?queue=billing"
        followUpLabel="Review all payment follow-up in Operations"
        summary={`Showing ${paymentFollowUp.rows.length} of ${paymentFollowUp.total} Facilities with a payment problem.`}
        rows={paymentFollowUp.rows.map((row) => ({
          href: `/console/customers/${row.id}`,
          title: row.displayName,
          detail: `${row.billingStatus} · ${row.licensedDepartments.join(", ") || "No licensed departments"}`,
        }))}
      />
    </div>
  );
}

function ImplementationQueue({ work, data }: {
  work: "assigned" | "unassigned";
  data: Awaited<ReturnType<typeof loadHarborUnassignedImplementation>> | null;
}) {
  const mine = work === "assigned";
  const title = mine ? "My assigned Implementation work" : "Unassigned Implementation requests";
  if (!data) return <section aria-label={title} className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
    <h2 className="text-sm font-semibold">{title}</h2>
    <p className="text-sm">This queue is unavailable while a retired Facility work context is present. Clear that context before managing Implementation requests.</p>
    <Link href={HARBOR_WORK_CLEANUP_PATH} className="inline-flex min-h-11 items-center text-sm font-medium underline">Clear retired Facility context</Link>
  </section>;
  return <Queue
    title={title}
    empty={mine ? "No Implementation requests are assigned to you." : "No Implementation requests are awaiting staff assignment."}
    followUp={harborCustomersHref({ work })}
    followUpLabel={mine ? "View my assigned work in Customers" : "View unassigned work in Customers"}
    summary={`Showing ${data.rows.length} of ${data.total} ${mine ? "requests assigned to you" : "unassigned requests"}.`}
    rows={data.rows.map(row => ({
      href: `/console/customers/${row.facilityId}/implementation?engagement=${encodeURIComponent(row.id)}`,
      title: row.facilityName,
      detail: `${row.organizationName} · Requested ${row.requestedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    }))}
  />;
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
  followUpLabel = "View setup follow-up in Customers",
  summary,
}: {
  title: string;
  empty: string;
  rows: Array<{ href: string; title: string; detail: string }>;
  followUp?: string;
  followUpLabel?: string;
  summary?: string;
}) {
  return (
    <section aria-label={title} className="rounded-md border border-[var(--border)] bg-white">
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
            {followUpLabel}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
