import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";

import {
  createFacilityOrganizationAction,
  retireAssetAction,
  updateAssetCriticalityAction,
  updateAssetDepartmentAction,
} from "@/app/(protected)/assets/actions";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { PhotoThumb } from "@/components/photos/photo-gallery";
import { ASSET_CRITICALITY_OPTIONS, assetCriticalityLabel } from "@/lib/asset-criticality";
import {
  ensureAndListResponsibleOrganizations,
  formatAssetLocationLabel,
  presentAssetLifecycleAndCondition,
  responsibleOrganizationDisplayLabel,
} from "@/lib/asset-operations";
import { getSession } from "@/lib/auth";
import { AppIcons } from "@/lib/design-system";
import { resolveFacilityVocabulary } from "@/lib/facility-builder/facility-vocabulary";
import { isDietaryAssetOperationsEnabled, isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { listPrimaryAssetPhotoIds } from "@/lib/attachments";

import { AssetAddForm } from "./asset-add-form";
import { AssetBuilderClient } from "./asset-builder-client";

/**
 * BUILD · Asset Builder — the canonical asset-configuration surface.
 *
 * Owns identity, location, responsible Department, Responsible Organization,
 * Preferred Repair Provider, criticality, and Active/Retired lifecycle.
 */
export default async function AssetBuilderPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;
  const assetOpsEnabled = isDietaryAssetOperationsEnabled();
  const canonicalLogsEnabled = isCanonicalLogsEnabled();

  const [units, spaces, vendors, organizations, departments, assets, facility] = await Promise.all([
    prisma.unit.findMany({
      where: { isActive: true, facilityId },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.unitSpace.findMany({
      where: { facilityId, isActive: true, unitId: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, unitId: true },
    }),
    prisma.vendor.findMany({
      where: { facilityId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    ensureAndListResponsibleOrganizations(prisma, facilityId),
    prisma.department.findMany({
      where: { facilityId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.asset.findMany({
      where: { unit: { facilityId } },
      orderBy: { createdAt: "desc" },
      include: {
        unit: { select: { name: true } },
        space: { select: { name: true } },
        vendor: { select: { name: true } },
        department: { select: { name: true } },
        responsibleOrganization: { select: { id: true, name: true, isActive: true } },
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
  const photoByAssetId = await listPrimaryAssetPhotoIds(
    facilityId,
    assets.map((asset) => asset.id),
  );
  const spaceOptions = spaces.map((s) => ({
    id: s.id,
    name: s.name,
    unitId: s.unitId,
  }));

  const PhotoPlaceholder = AppIcons.assets;

  return (
    <section className="space-y-4" data-testid="asset-builder-page">
      <AssetBuilderClient
        isEmpty={assets.length === 0}
        addForm={
          <AssetAddForm
            units={units}
            spaces={spaceOptions}
            departments={departments}
            organizations={organizations}
            vendors={vendors}
            roomTerm={roomTerm}
            assetOpsEnabled={assetOpsEnabled}
          />
        }
      >
        {assets.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <h2 className="sr-only">Assets</h2>
          <div data-testid="asset-registry">
            {assets.map((asset) => {
              const presentation = presentAssetLifecycleAndCondition(asset.status);
              const locationLabel = formatAssetLocationLabel({
                unitName: asset.unit.name,
                spaceName: asset.space?.name,
                roomTerm,
              });
              const orgLabel = responsibleOrganizationDisplayLabel(
                asset.responsibleOrganization
                  ? {
                      id: asset.responsibleOrganization.id,
                      name: asset.responsibleOrganization.name,
                      isActive: asset.responsibleOrganization.isActive,
                    }
                  : null,
              );
              const photoId = photoByAssetId.get(asset.id);
              return (
                <div
                  key={asset.id}
                  className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-3 py-3 last:border-b-0"
                  data-testid={`asset-row-${asset.id}`}
                  data-asset-lifecycle={presentation.lifecycle}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3 text-sm text-zinc-700">
                    {photoId ? (
                      <PhotoThumb
                        attachmentId={photoId}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-md border border-zinc-200 object-cover bg-zinc-100"
                      />
                    ) : (
                      <span
                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-zinc-400"
                        aria-hidden
                      >
                        <PhotoPlaceholder className="h-6 w-6" />
                      </span>
                    )}
                    <div className="min-w-0">
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
                    <p className="mt-1 text-xs leading-5">
                      {asset.equipmentType} · {locationLabel}
                      {" · "}
                      {asset.department?.name ? (
                        <>Dept: {asset.department.name}</>
                      ) : (
                        <span className="text-amber-700">No responsible department</span>
                      )}
                      {" · "}
                      Org: {orgLabel}
                      {" · "}
                      <span data-testid={`asset-status-label-${asset.id}`}>
                        {presentation.lifecycleLabel}
                      </span>
                      {" · "}
                      {assetCriticalityLabel(asset.criticality)}
                    </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canonicalLogsEnabled ? (
                      <Link
                        href={`/build/logs/targets/asset/${asset.id}`}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                        data-testid={`asset-logs-link-${asset.id}`}
                      >
                        Logs
                      </Link>
                    ) : null}
                    <form action={updateAssetDepartmentAction}>
                      <input type="hidden" name="assetId" value={asset.id} />
                      <AutoSubmitSelect
                        name="departmentId"
                        aria-label="Department"
                        defaultValue={asset.departmentId ?? ""}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                      >
                        <option value="">Unset department</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </AutoSubmitSelect>
                    </form>
                    <form action={updateAssetCriticalityAction}>
                      <input type="hidden" name="assetId" value={asset.id} />
                      <AutoSubmitSelect
                        name="criticality"
                        aria-label="Criticality"
                        defaultValue={asset.criticality}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                      >
                        {ASSET_CRITICALITY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </AutoSubmitSelect>
                    </form>
                    {assetOpsEnabled &&
                    presentation.lifecycle !== "RETIRED" &&
                    asset.departmentId ? (
                      <form action={retireAssetAction} className="flex items-center gap-1">
                        <input type="hidden" name="assetId" value={asset.id} />
                        <input type="hidden" name="departmentId" value={asset.departmentId} />
                        <input
                          name="reason"
                          required
                          placeholder="Retirement reason"
                          className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-800 hover:bg-red-50"
                        >
                          Retire
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        ) : null}

        <section
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
          data-testid="facility-organizations-panel"
        >
          <h2 className="text-lg font-semibold text-zinc-900">Facility &amp; operating partners</h2>
          <form action={createFacilityOrganizationAction} className="mt-3 flex flex-wrap gap-2">
            <input
              name="name"
              required
              placeholder="Operating partner name"
              className="min-w-[12rem] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              data-testid="create-org-name"
            />
            <input
              name="notes"
              placeholder="Notes (optional)"
              className="min-w-[12rem] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50"
            >
              Add operating partner
            </button>
          </form>
          <ul className="mt-3 space-y-1 text-sm text-zinc-700" data-testid="responsible-org-list">
            {organizations.map((org) => (
              <li key={org.id}>{org.name}</li>
            ))}
          </ul>
        </section>
      </AssetBuilderClient>
    </section>
  );
}
