import Link from "next/link";

import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { listHarborFacilities } from "@/lib/harbor-console/queries";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{ q?: string }>;

export default async function HarborCustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireHarborStaff();
  const query = (await searchParams).q?.trim() ?? "";
  const rows = await listHarborFacilities(prisma, query);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Every facility. Read-only.</p>
        </div>
        <form className="flex gap-2" action="/console/customers">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search name or email"
            className="w-64 rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-medium"
          >
            Search
          </button>
        </form>
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
                  No facilities match.
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
