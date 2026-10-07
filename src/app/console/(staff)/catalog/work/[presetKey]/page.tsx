import Link from "next/link";
import { notFound } from "next/navigation";

import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { CONSOLE_CATALOG_EMPTY } from "@/lib/harbor-console/console-catalog";
import { loadConsoleWorkPresetDetail } from "@/lib/harbor-console/console-catalog-detail";
import { prisma } from "@/lib/prisma";

export default async function HarborCatalogWorkPage({
  params,
}: {
  params: Promise<{ presetKey: string }>;
}) {
  await requireHarborStaff();
  const { presetKey } = await params;
  const detail = await loadConsoleWorkPresetDetail(prisma, presetKey);
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          Work preset
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{detail.name}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{detail.presetKey}</p>
      </header>

      <dl className="grid gap-4 rounded-md border border-[var(--border)] bg-white p-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium text-[var(--text-secondary)]">Owning Product</dt>
          <dd className="mt-1 text-sm">
            <Link
              href={`/console/catalog/products/${detail.owningProductKey}`}
              className="font-medium hover:underline"
            >
              {detail.owningProductName}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--text-secondary)]">Version</dt>
          <dd className="mt-1 text-sm" data-testid="work-version">
            {detail.versionLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--text-secondary)]">Status</dt>
          <dd className="mt-1 text-sm" data-testid="work-status">
            {detail.statusLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--text-secondary)]">Facilities installed</dt>
          <dd className="mt-1 text-sm" data-testid="work-install-count">
            {detail.facilityInstallCount}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--text-secondary)]">Published plans</dt>
          <dd className="mt-1 text-sm" data-testid="work-published-count">
            {detail.publishedPlanCount}
          </dd>
        </div>
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Description</h2>
        <p className="max-w-3xl text-sm text-[var(--text-secondary)]">
          {detail.description ?? CONSOLE_CATALOG_EMPTY}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Facility Work Plans</h2>
        <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-white">
          <table className="min-w-[880px] w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
              <tr>
                <th className="px-4 py-2 font-medium">Facility</th>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Version</th>
              </tr>
            </thead>
            <tbody>
              {detail.plans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-[var(--text-secondary)]">
                    No Facility Work Plans use this preset.
                  </td>
                </tr>
              ) : (
                detail.plans.map((plan) => (
                  <tr
                    key={plan.id}
                    data-testid="work-plan-row"
                    data-facility-name={plan.facilityName}
                    data-version={plan.version}
                    data-status={plan.status}
                    className="border-b border-[var(--border)] last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/console/customers/${plan.facilityId}`}
                        className="font-medium hover:underline"
                      >
                        {plan.facilityName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{plan.organizationName}</td>
                    <td className="px-4 py-3">{plan.departmentName}</td>
                    <td className="px-4 py-3">{plan.planName}</td>
                    <td className="px-4 py-3">{plan.status}</td>
                    <td className="px-4 py-3">{plan.version}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Link href="/console/catalog" className="text-sm text-[var(--text-secondary)] hover:underline">
        Back to Marketplace
      </Link>
    </div>
  );
}
