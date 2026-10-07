import Link from "next/link";
import { notFound } from "next/navigation";

import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { CONSOLE_CATALOG_EMPTY } from "@/lib/harbor-console/console-catalog";
import {
  PRODUCT_ACCESS_ROLE_ROWS,
  loadConsoleDepartmentProductDetail,
} from "@/lib/harbor-console/console-catalog-detail";
import { prisma } from "@/lib/prisma";

export default async function HarborCatalogProductPage({
  params,
}: {
  params: Promise<{ productKey: string }>;
}) {
  await requireHarborStaff();
  const { productKey } = await params;
  const detail = await loadConsoleDepartmentProductDetail(prisma, productKey);
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          Department Product
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{detail.name}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{detail.productKey}</p>
      </header>

      <dl className="grid gap-4 rounded-md border border-[var(--border)] bg-white p-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium text-[var(--text-secondary)]">Installation key</dt>
          <dd className="mt-1 text-sm">{detail.installationKey}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--text-secondary)]">Version</dt>
          <dd className="mt-1 text-sm" data-testid="product-version">
            {detail.versionLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--text-secondary)]">Status</dt>
          <dd className="mt-1 text-sm" data-testid="product-status">
            {detail.status}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--text-secondary)]">Released</dt>
          <dd className="mt-1 text-sm" data-testid="product-released">
            {detail.releasedLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--text-secondary)]">Facilities installed</dt>
          <dd className="mt-1 text-sm" data-testid="product-install-count">
            {detail.facilityInstallCount}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--text-secondary)]">Users with access</dt>
          <dd className="mt-1 text-sm" data-testid="product-user-count">
            {detail.usersWithAccess}
          </dd>
        </div>
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Description</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {detail.shortDescription ?? CONSOLE_CATALOG_EMPTY}
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold">Industry</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{detail.industryLabel}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Facility types</h2>
          <ul className="mt-1 text-sm text-[var(--text-secondary)]">
            {detail.facilityTypeLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Capabilities</h2>
        {detail.capabilities.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">{CONSOLE_CATALOG_EMPTY}</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
            {detail.capabilities.map((capability) => (
              <li key={capability} data-testid="product-capability">
                {capability}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Users with access</h2>
        <dl className="grid gap-3 rounded-md border border-[var(--border)] bg-white p-4 sm:grid-cols-3">
          {PRODUCT_ACCESS_ROLE_ROWS.map((role) => (
            <div key={role.key}>
              <dt className="text-xs font-medium text-[var(--text-secondary)]">{role.label}</dt>
              <dd className="mt-1 text-sm" data-testid="role-count" data-role={role.key}>
                {detail.roleCounts[role.key]}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Installed Facilities</h2>
        <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-white">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
              <tr>
                <th className="px-4 py-2 font-medium">Facility</th>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Installed</th>
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-4 py-2 font-medium">Users</th>
                <th className="px-4 py-2 font-medium">Product access</th>
                <th className="px-4 py-2 font-medium">Department status</th>
              </tr>
            </thead>
            <tbody>
              {detail.facilities.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-[var(--text-secondary)]">
                    No Facilities have this Product installed.
                  </td>
                </tr>
              ) : (
                detail.facilities.map((row) => (
                  <tr
                    key={row.facilityId}
                    data-testid="installed-facility-row"
                    data-facility-name={row.facilityName}
                    data-department-key={row.departmentKey}
                    data-users={row.userCount}
                    className="border-b border-[var(--border)] last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/console/customers/${row.facilityId}`}
                        className="font-medium hover:underline"
                      >
                        {row.facilityName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{row.organizationName}</td>
                    <td className="px-4 py-3">{row.installedLabel}</td>
                    <td className="px-4 py-3">
                      <p>{row.departmentName}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{row.departmentKey}</p>
                    </td>
                    <td className="px-4 py-3">{row.userCount}</td>
                    <td className="px-4 py-3">{row.accessLabel}</td>
                    <td className="px-4 py-3">{row.departmentStatusLabel}</td>
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
