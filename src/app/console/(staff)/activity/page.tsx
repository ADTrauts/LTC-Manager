import { redirect } from "next/navigation";

import { ConsolePanel, ConsoleReadLink, ConsoleTimestamp } from "@/components/harbor-console/operations-ui";
import { HARBOR_ACTIVITY_FILTERS, harborActivityHref, loadHarborOwnActivity } from "@/lib/harbor-console/activity";
import { requireHarborOwner } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HarborOwnActivityPage({ searchParams }: {
  searchParams: Promise<{ filter?: string | string[]; page?: string | string[] }>;
}) {
  const session = await requireHarborOwner();
  const data = await loadHarborOwnActivity(prisma, session, await searchParams);
  if (!data) redirect("/console/login");

  return <div className="mx-auto max-w-5xl space-y-6">
    <header>
      <h1 className="text-2xl font-semibold tracking-tight">My activity</h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Recorded sign-ins, customer reviews, Facility provisions and Marketplace actions for {data.staffName}. Times are shown in UTC.
      </p>
    </header>

    <ConsolePanel title="Recorded actions">
      <form action="/console/activity" method="get" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="activity-filter" className="block font-medium">Activity type</label>
          <select id="activity-filter" name="filter" defaultValue={data.filter}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2">
            {HARBOR_ACTIVITY_FILTERS.map((filter) => <option key={filter.key} value={filter.key}>{filter.label}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-md border border-[var(--border)] px-4 py-2 font-medium hover:bg-[var(--surface-muted)]">Apply filter</button>
      </form>

      {data.rows.length ? <>
        <p className="text-xs text-[var(--text-secondary)]">Showing {data.offset + 1}–{data.offset + data.rows.length} of {data.total} recorded actions.</p>
        <ol className="divide-y divide-[var(--border)]">
          {data.rows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="min-w-0 space-y-1">
              <h3 className="font-semibold">{row.label}</h3>
              {row.detail ? <p className="break-words text-[var(--text-secondary)]">{row.detail}</p> : null}
              <p className="text-xs text-[var(--text-secondary)]"><ConsoleTimestamp value={row.occurredAt} /></p>
            </div>
            {row.href && row.linkLabel ? <ConsoleReadLink href={row.href}>{row.linkLabel}</ConsoleReadLink> : null}
          </li>)}
        </ol>
      </> : <p>No recorded activity for this filter.</p>}

      <nav aria-label="Activity pagination" className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-3">
        {data.page > 1 ? <ConsoleReadLink href={harborActivityHref(data.filter, data.page - 1)}>Previous</ConsoleReadLink> : <span />}
        <span>Page {data.page} of {data.pageCount}</span>
        {data.page < data.pageCount ? <ConsoleReadLink href={harborActivityHref(data.filter, data.page + 1)}>Next</ConsoleReadLink> : <span />}
      </nav>
      <p className="text-xs text-[var(--text-secondary)]">Older events may lack a customer or Record reference. Ticket and Implementation histories remain on their individual screens.</p>
    </ConsolePanel>
  </div>;
}
