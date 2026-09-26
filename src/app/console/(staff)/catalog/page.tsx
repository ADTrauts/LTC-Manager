import Link from "next/link";

import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { listHarborCatalogLines } from "@/lib/harbor-console/catalog";
import { prisma } from "@/lib/prisma";

export default async function HarborCatalogPage() {
  await requireHarborStaff();
  const rows = await listHarborCatalogLines(prisma);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            LTC Corp logs, checklists, inspections, and procedures. Facilities install them, then place them. They do not author them.
          </p>
        </div>
        <Link
          href="/console/catalog/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)]"
        >
          New catalog log
        </Link>
      </header>

      <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Purpose</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Facilities</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-[var(--text-secondary)]">
                  No catalog logs yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.stableKey} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/console/catalog/${row.stableKey}`}
                      className="font-medium hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-[var(--text-secondary)]">{row.stableKey}</p>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{row.categoryLabel}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{row.purposeLabel}</td>
                  <td className="px-4 py-3">{row.statusLabel}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {row.installCount === 0
                      ? "None yet"
                      : `${row.installCount} installed`}
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
