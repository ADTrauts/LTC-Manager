import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";

import {
  createVendorAction,
  updateAssetStatusAction,
} from "@/app/(protected)/assets/actions";
import { EmptyState } from "@/components/design-system";
import { MaintenanceSubNav } from "@/components/maintenance-sub-nav";
import { AssetKnowledgeTrigger } from "@/components/knowledge/asset-knowledge-trigger";
import { PhotoThumb } from "@/components/photos/photo-gallery";
import { assetCriticalityLabel } from "@/lib/asset-criticality";
import {
  ASSET_BUILD_PATH,
  OPEN_ASSET_ISSUE_STATUSES,
  OPEN_WORK_ORDER_STATUSES,
  assetResponsibleDepartmentWhere,
  conditionToneClass,
  formatAssetLocationAriaLabel,
  formatAssetLocationLabel,
  presentAssetLifecycleAndCondition,
  runConditionSelectValues,
} from "@/lib/asset-operations";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { departmentFilterIdsForSession } from "@/lib/department-scope";
import { resolveFacilityVocabulary } from "@/lib/facility-builder/facility-vocabulary";
import { isDietaryAssetOperationsEnabled } from "@/lib/feature-flags";
import {
  loadContextualKnowledgeByAssetIds,
  toContextualKnowledgeClientArticles,
} from "@/lib/knowledge/contextual";
import { prisma } from "@/lib/prisma";
import { listPrimaryAssetPhotoIds } from "@/lib/attachments";

type AssetsPageProps = {
  searchParams: Promise<{ subtab?: string }>;
};

function parseSubtab(raw: string | undefined): "vendors" | "assets" {
  return raw === "vendors" || raw === "assets" ? raw : "assets";
}

/**
 * RUN · Maintenance (Assets tab) — operational registry and condition.
 *
 * Asset creation / identity / responsible-department configuration lives on
 * BUILD · Asset Builder (`/assets/builder`). This page does not duplicate that form.
 */
export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  noStore();
  const params = await searchParams;
  const activeSubtab = parseSubtab(typeof params.subtab === "string" ? params.subtab : undefined);
  const assetOpsEnabled = isDietaryAssetOperationsEnabled();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;
  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const departmentWhere = assetResponsibleDepartmentWhere(deptNav.activeDepartmentId);

  const [vendors, assets, facility] = await Promise.all([
    prisma.vendor.findMany({
      where: { facilityId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.asset.findMany({
      where: { unit: { facilityId }, ...departmentWhere },
      orderBy: { createdAt: "desc" },
      include: {
        unit: { select: { name: true } },
        space: { select: { name: true } },
        vendor: { select: { name: true } },
        department: { select: { name: true } },
      },
    }),
    prisma.facility.findFirst({
      where: { id: facilityId },
      select: {
        vocabularyProfile: true,
        vocabularyLevel1Label: true,
        vocabularyLevel2Label: true,
        vocabularyLevel3Label: true,
      },
    }),
  ]);

  const roomTerm = resolveFacilityVocabulary(facility).level3.singular;
  const assetIds = assets.map((a) => a.id);
  const photoByAssetId = await listPrimaryAssetPhotoIds(facilityId, assetIds);

  const [openIssueGroups, openRepairGroups] =
    assetOpsEnabled && assetIds.length > 0
      ? await Promise.all([
          prisma.assetIssue.groupBy({
            by: ["assetId"],
            where: {
              facilityId,
              assetId: { in: assetIds },
              status: { in: OPEN_ASSET_ISSUE_STATUSES },
            },
            _count: { _all: true },
          }),
          prisma.repair.groupBy({
            by: ["assetId"],
            where: {
              assetId: { in: assetIds },
              unit: { facilityId },
              status: { in: OPEN_WORK_ORDER_STATUSES },
            },
            _count: { _all: true },
          }),
        ])
      : [[], []];

  const openIssueCount = new Map(openIssueGroups.map((r) => [r.assetId, r._count._all]));
  const openRepairCount = new Map(
    openRepairGroups
      .filter((r): r is typeof r & { assetId: string } => Boolean(r.assetId))
      .map((r) => [r.assetId, r._count._all]),
  );

  const viewerDepartmentIds = await departmentFilterIdsForSession(session);
  const knowledgeByAsset = await loadContextualKnowledgeByAssetIds({
    facilityId,
    viewerDepartmentIds,
    assetIds,
    limitPerAsset: 5,
  });

  return (
    <section className="space-y-6" data-testid="run-assets-page">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Maintenance</h1>
          <Link
            href={ASSET_BUILD_PATH}
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            data-testid="open-asset-builder"
          >
            Open Asset Builder
          </Link>
        </div>
        <MaintenanceSubNav
          role={session.role}
          activeId={activeSubtab === "vendors" ? "vendors" : "assets"}
        />
      </header>

      {activeSubtab === "vendors" ? (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Add Vendor</h2>
            <form action={createVendorAction} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input name="name" required placeholder="Vendor name" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input name="contactName" placeholder="Contact name" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input name="phone" placeholder="Phone" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input name="email" type="email" placeholder="Email" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input name="notes" placeholder="Notes" className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2 xl:col-span-4" />
              <div className="md:col-span-2 xl:col-span-4">
                <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
                  Add vendor
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Vendor Registry</h2>
            <div className="mt-3 space-y-2">
              {vendors.map((vendor) => (
                <div key={vendor.id} className="rounded border border-zinc-200 p-2 text-sm text-zinc-700">
                  <p className="font-medium text-zinc-900">{vendor.name}</p>
                </div>
              ))}
              {vendors.length === 0 ? <p className="text-sm text-zinc-500">No vendors yet.</p> : null}
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Equipment</h2>
          {assets.length === 0 ? (
            <div className="mt-3" data-testid="asset-registry">
              <EmptyState
                icon="assets"
                inset
                title="No equipment registered"
                description="This list will show condition, open issues, and repairs once equipment is registered."
                action={
                  <Link
                    href={ASSET_BUILD_PATH}
                    className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700"
                    data-testid="empty-open-asset-builder"
                  >
                    Register equipment
                  </Link>
                }
              />
            </div>
          ) : (
          <div className="mt-3 space-y-2" data-testid="asset-registry">
            {assets.map((asset) => {
              const presentation = presentAssetLifecycleAndCondition(asset.status);
              const locationLabel = formatAssetLocationLabel({
                unitName: asset.unit.name,
                spaceName: asset.space?.name,
                roomTerm,
              });
              const locationAria = formatAssetLocationAriaLabel({
                unitName: asset.unit.name,
                spaceName: asset.space?.name,
                roomTerm,
              });
              const issueCount = openIssueCount.get(asset.id) ?? 0;
              const repairCount = openRepairCount.get(asset.id) ?? 0;
              const conditionOptions = runConditionSelectValues(asset.status);
              const photoId = photoByAssetId.get(asset.id);
              return (
                <div
                  key={asset.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-200 p-2"
                  data-testid={`asset-row-${asset.id}`}
                  data-asset-lifecycle={presentation.lifecycle}
                  data-asset-condition={presentation.condition ?? "RETIRED"}
                >
                  <div className="flex min-w-0 items-start gap-3 text-sm text-zinc-700">
                    {photoId ? (
                      <PhotoThumb
                        attachmentId={photoId}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-md border border-zinc-200 object-cover bg-zinc-100"
                      />
                    ) : null}
                    <div>
                    <p className="font-medium text-zinc-900">
                      {assetOpsEnabled ? (
                        <Link
                          href={`/assets/${asset.id}`}
                          className="underline underline-offset-2"
                          data-testid={`asset-profile-link-${asset.id}`}
                        >
                          {asset.assetCode} · {asset.name}
                        </Link>
                      ) : (
                        <>
                          {asset.assetCode} · {asset.name}
                        </>
                      )}
                    </p>
                    <p className="text-xs">
                      {asset.equipmentType}
                      {" · "}
                      <span aria-label={locationAria}>{locationLabel}</span>
                      {" · "}
                      {asset.department?.name ? (
                        <>Dept: {asset.department.name}</>
                      ) : (
                        <span className="text-amber-700">No responsible department</span>
                      )}
                      {" · "}
                      <span
                        className={conditionToneClass(presentation.conditionTone)}
                        data-testid={`asset-status-label-${asset.id}`}
                      >
                        {presentation.summaryLabel}
                      </span>
                      {assetOpsEnabled && issueCount > 0 ? (
                        <> · {issueCount} open issue{issueCount === 1 ? "" : "s"}</>
                      ) : null}
                      {assetOpsEnabled && repairCount > 0 ? (
                        <> · {repairCount} open repair{repairCount === 1 ? "" : "s"}</>
                      ) : null}
                      {" · "}
                      {assetCriticalityLabel(asset.criticality)}
                    </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AssetKnowledgeTrigger
                      articles={toContextualKnowledgeClientArticles(
                        knowledgeByAsset.get(asset.id) ?? [],
                      )}
                      assetLabel={`${asset.assetCode} · ${asset.name}`}
                    />
                    {presentation.lifecycle === "RETIRED" ? (
                      <p className="text-xs text-zinc-500">Lifecycle: Retired — condition locked</p>
                    ) : (
                      <form action={updateAssetStatusAction} className="flex items-center gap-2">
                        <input type="hidden" name="assetId" value={asset.id} />
                        {asset.departmentId ? (
                          <input type="hidden" name="departmentId" value={asset.departmentId} />
                        ) : null}
                        <label className="sr-only" htmlFor={`condition-${asset.id}`}>
                          Condition for {asset.name}
                        </label>
                        <select
                          id={`condition-${asset.id}`}
                          name="status"
                          defaultValue={presentation.condition ?? "OPERATIONAL"}
                          className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                        >
                          {conditionOptions.map((value) => (
                            <option key={value} value={value}>
                              {value === "OPERATIONAL"
                                ? "Operational"
                                : value === "DEGRADED"
                                  ? "Degraded"
                                  : "Out of Service"}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                        >
                          Update condition
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </section>
      )}
    </section>
  );
}
