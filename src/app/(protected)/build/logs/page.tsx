import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";

import { CatalogBrowseClient } from "@/components/canonical-logs/catalog-browse-client";
import { BuildPageHeader } from "@/components/build/build-breadcrumb";
import { getSession } from "@/lib/auth";
import { buildPageIntro } from "@/lib/build-hub";
import {
  listFacilityAttachments,
  listPublishedCatalogBrowseCards,
  loadCycleOptionsForDepartment,
  cycleLabelMap,
} from "@/lib/canonical-logs";
import { hasAtLeastRole } from "@/lib/access";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{ tab?: string; departmentId?: string }>;

export default async function BuildLogsPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  if (!isCanonicalLogsEnabled()) {
    redirect("/build");
  }

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "MANAGER")) redirect("/build");

  const query = await searchParams;
  const tab = query.tab === "attachments" ? "attachments" : "catalog";
  const facilityId = session.facilityId;

  const departments = await prisma.department.findMany({
    where: { facilityId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  const catalogCards = await listPublishedCatalogBrowseCards(prisma);

  let attachments: Awaited<ReturnType<typeof listFacilityAttachments>> = [];
  if (tab === "attachments") {
    const cycleLabelByKey = new Map<string, string>();
    const publishedByDept = new Map<string, readonly string[]>();
    for (const dept of departments) {
      const options = await loadCycleOptionsForDepartment(prisma, facilityId, dept.id);
      for (const o of options) cycleLabelByKey.set(o.stableKey, o.label);
      publishedByDept.set(
        dept.id,
        options.map((o) => o.stableKey),
      );
    }
    attachments = await listFacilityAttachments(prisma, {
      facilityId,
      departmentId: query.departmentId || null,
      cycleLabelByKey,
      publishedCycleStableKeysByDepartment: publishedByDept,
    });
  }

  const needsSetupCount = attachments.filter((a) => a.needsSetup).length;

  return (
    <section className="space-y-4" data-testid="build-logs-page">
      <BuildPageHeader title="Logs" subtitle={buildPageIntro("/build/logs")} />

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Logs sections">
        <Link
          href="/build/logs"
          className={`min-h-9 rounded-md px-3 py-2 font-medium ${
            tab === "catalog" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-800"
          }`}
        >
          Catalog
        </Link>
        <Link
          href="/build/logs?tab=attachments"
          className={`min-h-9 rounded-md px-3 py-2 font-medium ${
            tab === "attachments" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-800"
          }`}
        >
          Attachments
          {needsSetupCount > 0 ? (
            <span className="ml-1 text-xs opacity-80">· {needsSetupCount} needs setup</span>
          ) : null}
        </Link>
      </nav>

      {tab === "catalog" ? (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">
            Browse LTC Corp Catalog Logs. Attach them from an Asset, Room, Unit, or Department.
          </p>
          <CatalogBrowseClient
            cards={catalogCards}
            detailHrefPrefix="/build/logs/catalog/"
          />
        </div>
      ) : (
        <div className="space-y-3" data-testid="attachments-index">
          <p className="text-xs text-zinc-500">
            Facility-wide Attachment index for setup audit. Prefer attaching from the target.
          </p>
          {attachments.length === 0 ? (
            <p className="text-sm text-zinc-500">No Attachments yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Log</th>
                    <th className="px-3 py-2 font-medium">Schedule</th>
                    <th className="px-3 py-2 font-medium">Department</th>
                    <th className="px-3 py-2 font-medium">State</th>
                    <th className="px-3 py-2 font-medium">Effective</th>
                    <th className="px-3 py-2 font-medium"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {attachments.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-medium text-zinc-900">{row.displayName}</td>
                      <td className="px-3 py-2 text-xs text-zinc-600">{row.timingSummary}</td>
                      <td className="px-3 py-2 text-xs text-zinc-600">
                        {row.departmentName ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium">{row.primaryStateLabel}</td>
                      <td className="px-3 py-2 text-xs text-zinc-600">{row.effectiveFromKey}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={row.editHref}
                          className="text-xs font-medium underline underline-offset-2"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
