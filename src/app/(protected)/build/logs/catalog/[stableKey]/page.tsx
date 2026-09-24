import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { BuildPageHeader } from "@/components/build/build-breadcrumb";
import { CatalogAddToTarget } from "@/components/canonical-logs/catalog-add-to-target";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { loadPublishedCatalogDetail } from "@/lib/canonical-logs";
import { loadCatalogAssignView } from "@/lib/canonical-logs/catalog-assign";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ stableKey: string }> };

export default async function CatalogDetailPage({ params }: Props) {
  noStore();
  if (!isCanonicalLogsEnabled()) redirect("/build");

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "MANAGER")) redirect("/build");

  const { stableKey } = await params;
  const detail = await loadPublishedCatalogDetail(prisma, stableKey);
  if (!detail) notFound();

  const assignView = await loadCatalogAssignView({
    client: prisma,
    facilityId: session.facilityId,
    catalogStableKey: stableKey,
  });
  if (!assignView) notFound();

  return (
    <section className="space-y-4" data-testid="catalog-detail-page">
      <BuildPageHeader
        title={detail.name}
        subtitle={`${detail.categoryLabel} · ${detail.purposeLabel}`}
      />
      <p className="text-sm text-zinc-700">{detail.description}</p>
      <p className="text-xs text-zinc-500">LTC Corp maintained · Catalog version {detail.version}</p>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-zinc-500">Recommended cadence</dt>
          <dd className="text-sm text-zinc-900">{detail.recommendedCadenceLabel}</dd>
        </div>
        {detail.suggestedForLabels.length > 0 ? (
          <div>
            <dt className="text-xs font-medium text-zinc-500">Suggested for</dt>
            <dd className="text-sm text-zinc-900">{detail.suggestedForLabels.join(" · ")}</dd>
          </div>
        ) : null}
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900">What staff will complete</h2>
        <p className="text-xs text-zinc-600">{detail.instructions}</p>
        <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
          {detail.fields.map((field) => (
            <li key={field.label} className="px-3 py-2">
              <p className="text-sm font-medium text-zinc-900">{field.label}</p>
              {field.rangeLabel ? (
                <p className="text-xs text-zinc-600">{field.rangeLabel}</p>
              ) : null}
              {field.helpText ? <p className="text-xs text-zinc-500">{field.helpText}</p> : null}
            </li>
          ))}
        </ul>
        {detail.correctiveActionSummary ? (
          <p className="text-xs text-zinc-700">{detail.correctiveActionSummary}</p>
        ) : null}
        <p className="text-xs text-zinc-500">
          Catalog fields and ranges are read-only for facility users.
        </p>
      </section>

      <CatalogAddToTarget view={assignView} />

      <Link
        href="/build/logs"
        className="inline-flex min-h-9 items-center rounded-md border border-zinc-300 px-2.5 text-sm"
      >
        Back to Catalog
      </Link>
    </section>
  );
}
