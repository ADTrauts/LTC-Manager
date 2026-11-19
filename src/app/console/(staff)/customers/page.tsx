import Link from "next/link";

import { isHarborOwnerSession, peekHarborWorkFacilityId, requireHarborStaff } from "@/lib/harbor-console/auth";
import { harborCustomersHref } from "@/lib/harbor-console/presentation";
import { loadHarborCustomerDirectoryPage } from "@/lib/harbor-console/queries";
import { HARBOR_WORK_CLEANUP_PATH } from "@/lib/harbor-console/session";
import { prisma } from "@/lib/prisma";

type SearchParam = string | string[] | undefined;
type SearchParams = Promise<{ q?: SearchParam; work?: SearchParam; setup?: SearchParam; page?: SearchParam }>;

export default async function HarborCustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireHarborStaff();
  const [{ q, work, setup, page: requestedPage }, workFacilityId] = await Promise.all([searchParams, peekHarborWorkFacilityId()]);
  const query = typeof q === "string" ? q.trim() : "";
  // A submitted filter must not narrow the directory while a legacy work context is present.
  const filter = !workFacilityId && (work === "open" || work === "unassigned" || work === "assigned") ? work : null;
  const setupFilter = setup === "awaiting" || setup === "acknowledged" ? setup : null;
  const { rows, total, page, pageCount, offset } = await loadHarborCustomerDirectoryPage(prisma, {
    query,
    page: requestedPage,
    setup: setupFilter ?? undefined,
    implementation: filter ? { filter, actor: { kind: "staff", session, workFacilityId } } : undefined,
  });
  const canProvision = isHarborOwnerSession(session);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Every facility. Billing money stays in Stripe; open a facility for diagnostics and sync.
          </p>
        </div>
        {canProvision ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/console/customers/invitation-follow-up" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2">
              Administrator invitation follow-up
            </Link>
            <Link
              href="/console/customers/new"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)]"
            >
              New customer
            </Link>
          </div>
        ) : null}
        <form key={JSON.stringify([query, filter, setupFilter, page])} className="flex flex-wrap items-end gap-2" action="/console/customers">
          <input
            type="search"
            name="q"
            defaultValue={query}
            aria-label="Search name or email"
            placeholder="Search name or email"
            className="min-h-11 w-64 max-w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm"
          />
          {!workFacilityId ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]">
              Implementation work
              <select
                name="work"
                defaultValue={filter ?? "all"}
                className="min-h-11 rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
              >
                <option value="all">All Facilities</option>
                <option value="open">Open work</option>
                <option value="unassigned">Unassigned work</option>
                <option value="assigned">Assigned to me</option>
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]">
            Guided setup
            <select
              name="setup"
              defaultValue={setupFilter ?? "all"}
              className="min-h-11 rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
            >
              <option value="all">All setup statuses</option>
              <option value="awaiting">Awaiting acknowledgment</option>
              <option value="acknowledged">Acknowledged</option>
            </select>
          </label>
          <button
            type="submit"
            className="min-h-11 rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-medium"
          >
            Search
          </button>
          {filter ? (
            <Link href={harborCustomersHref({ query, setup: setupFilter })} className="inline-flex min-h-11 items-center px-2 text-sm underline">
              Clear work filter
            </Link>
          ) : null}
          {setupFilter ? (
            <Link href={harborCustomersHref({ query, work: filter })} className="inline-flex min-h-11 items-center px-2 text-sm underline">
              Clear setup filter
            </Link>
          ) : null}
        </form>
        {workFacilityId ? (
          <p className="basis-full text-sm text-[var(--text-secondary)]">
            <Link href={HARBOR_WORK_CLEANUP_PATH} className="underline">Clear old work session</Link>{" "}
            to filter by Implementation work.
          </p>
        ) : null}
      </header>

      <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
            <tr>
              <th className="px-4 py-2 font-medium">Facility</th>
              <th className="px-4 py-2 font-medium">Organization</th>
              <th className="px-4 py-2 font-medium">Setup</th>
              <th className="px-4 py-2 font-medium">Billing</th>
              <th className="px-4 py-2 font-medium">Departments</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-[var(--text-secondary)]">
                  {setupFilter ? "No facilities match the selected setup filters." : filter
                    ? (query ? "No facilities match this search and work filter." : "No facilities match this work filter.")
                    : "No facilities match."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-4 py-3">
                    <Link href={`/console/customers/${row.id}`} className="font-medium hover:underline">
                      {row.displayName}
                    </Link>
                    {row.billingEmail ? (
                      <p className="text-xs text-[var(--text-secondary)]">{row.billingEmail}</p>
                    ) : null}
                    <Link
                      href={`/console/customers/${row.id}/lifecycle`}
                      prefetch={false}
                      aria-label={`View lifecycle for ${row.displayName}`}
                      className="mt-1 flex min-h-8 w-fit items-center text-xs underline"
                    >
                      Lifecycle and readiness
                    </Link>
                    {filter ? (
                      <Link
                        href={`/console/customers/${row.id}/implementation`}
                        aria-label={`View Implementation work for ${row.displayName}`}
                        className="mt-1 flex min-h-8 w-fit items-center text-xs underline"
                        prefetch={false}
                      >
                        View Implementation work
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    <Link href={`/console/customers/organizations/${row.organizationId}`} className="underline underline-offset-2">
                      {row.organizationName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{row.onboarding}</td>
                  <td className="px-4 py-3">{row.billingStatus}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {row.licensedDepartments.join(", ") || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
          <p>Showing {offset + 1}–{offset + rows.length} of {total} {total === 1 ? "facility" : "facilities"}</p>
          {pageCount > 1 ? (
            <nav aria-label="Customer pages" className="flex items-center gap-2">
              {page > 1 ? (
                <Link
                  href={harborCustomersHref({ query, work: filter, setup: setupFilter, page: page - 1 })}
                  rel="prev"
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-white px-3 hover:text-[var(--foreground)]"
                >
                  Previous
                </Link>
              ) : null}
              <span className="px-1">Page {page} of {pageCount}</span>
              {page < pageCount ? (
                <Link
                  href={harborCustomersHref({ query, work: filter, setup: setupFilter, page: page + 1 })}
                  rel="next"
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-white px-3 hover:text-[var(--foreground)]"
                >
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
