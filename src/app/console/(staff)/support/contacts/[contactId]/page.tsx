import Link from "next/link";
import { notFound } from "next/navigation";

import { SupportHistoryPanel } from "@/components/harbor-console/support-history-panel";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { loadSupportContactHistory, supportFacilityHref } from "@/lib/support/history";

export default async function HarborSupportContactPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  await requireHarborStaff();
  const { contactId } = await params;
  const history = await loadSupportContactHistory(prisma, contactId);
  if (!history) {
    notFound();
  }

  const { contact } = history;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          Support contact
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {contact.displayName || contact.email}
        </h1>
        {contact.displayName ? (
          <p className="text-sm text-[var(--text-secondary)]">{contact.email}</p>
        ) : null}
      </header>

      <section className="rounded-md border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold">Identity</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">Email</dt>
            <dd className="mt-0.5">{contact.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">Vssyl user</dt>
            <dd className="mt-0.5">{contact.userId ? "Matched" : "None"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">Current facility</dt>
            <dd className="mt-0.5">
              {contact.facilityId && contact.facilityName ? (
                <Link href={supportFacilityHref(contact.facilityId)} className="underline">
                  {contact.facilityName}
                </Link>
              ) : (
                "None"
              )}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          Support history belongs to this contact. Ticket facilities are not rewritten if the
          contact later changes facility.
        </p>
      </section>

      <SupportHistoryPanel
        empty="No previous support history."
        counts={history}
        lastLabel="Last contact"
        lastAt={history.lastContactAt}
        recent={history.recent}
        viewAllHref={history.viewAllHref}
        viewAllLabel="View all support tickets"
        extraCounts={[{ label: "Closed", value: history.closed }]}
      />
    </div>
  );
}
