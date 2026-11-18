import Link from "next/link";

import { isHarborOwnerSession, peekHarborWorkFacilityId, requireHarborStaff } from "@/lib/harbor-console/auth";
import { listHarborFacilities } from "@/lib/harbor-console/queries";
import { HARBOR_WORK_CLEANUP_PATH } from "@/lib/harbor-console/session";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{ q?: string | string[]; work?: string | string[] }>;

export default async function HarborCustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireHarborStaff();
  const [{ q, work }, workFacilityId] = await Promise.all([searchParams, peekHarborWorkFacilityId()]);
  const query = typeof q === "string" ? q.trim() : "";
  // A submitted filter must not narrow the directory while a legacy work context is present.
  const filter = !workFacilityId && (work === "open" || work === "unassigned") ? work : null;
  const rows = await listHarborFacilities(prisma, query, filter ? {
    filter, actor: { kind: "staff", session, workFacilityId },
  } : undefined);
  const clearWorkHref = query ? `/console/customers?${new URLSearchParams({ q: query })}` : "/console/customers";
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
          <Link
            href="/console/customers/new"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)]"
          >
            New customer
          </Link>
        ) : null}
        <form key={JSON.stringify([query, filter])} className="flex flex-wrap items-end gap-2" action="/console/customers">
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
              </select>
            </label>
          ) : null}
          <button
            type="submit"
            className="min-h-11 rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-medium"
          >
            Search
          </button>
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
                  {filter ? (
                    <>
                      {query ? "No facilities match this search and work filter." : "No facilities match this work filter."}{" "}
                      <Link href={clearWorkHref} className="underline">Clear work filter</Link>
                    </>
                  ) : "No facilities match."}
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
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{row.organizationName}</td>
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
    </div>
  );
}
