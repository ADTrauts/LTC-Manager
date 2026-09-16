import { AssetCriticality } from "@prisma/client";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";

import {
  createAssetAction,
  createFacilityOrganizationAction,
  retireAssetAction,
  updateAssetCriticalityAction,
  updateAssetDepartmentAction,
} from "@/app/(protected)/assets/actions";
import { AssetUnitSpaceFields } from "@/components/asset-operations/asset-unit-space-fields";
import { BuildPageHeader } from "@/components/build/build-breadcrumb";
import { ASSET_CRITICALITY_OPTIONS, assetCriticalityLabel } from "@/lib/asset-criticality";
import {
  ensureAndListResponsibleOrganizations,
  formatAssetLocationLabel,
  presentAssetLifecycleAndCondition,
  responsibleOrganizationDisplayLabel,
} from "@/lib/asset-operations";
import { getSession } from "@/lib/auth";
import { buildPageIntro } from "@/lib/build-hub";
import { resolveFacilityVocabulary } from "@/lib/facility-builder/facility-vocabulary";
import { isDietaryAssetOperationsEnabled, isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

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
  const spaceOptions = spaces.map((s) => ({
    id: s.id,
    name: s.name,
    unitId: s.unitId,
  }));

  return (
    <section className="space-y-4" data-testid="asset-builder-page">
      <BuildPageHeader title="Asset Builder" subtitle={buildPageIntro("/assets/builder")} />

      <p className="text-xs text-zinc-500" data-testid="asset-builder-ownership-note">
        Configure what each asset is, where it belongs, and who is responsible for it. Day-to-day
        condition, reported issues, and repairs belong on operational Assets.
      </p>

      <AssetBuilderClient
        isEmpty={assets.length === 0}
        addForm={
          <section
            id="asset-builder-add"
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
            data-testid="asset-builder"
          >
            <h2 className="text-lg font-semibold text-zinc-900">Add Asset</h2>
            <form action={createAssetAction} className="mt-3 space-y-5">
              <fieldset className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <legend className="mb-1 text-sm font-semibold text-zinc-900">Identity</legend>
                <input
                  name="assetCode"
                  required
                  placeholder="Asset code"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  data-testid="create-asset-code"
                />
                <input
                  name="name"
                  required
                  placeholder="Asset name"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  data-testid="create-asset-name"
                />
                <input
                  name="equipmentType"
                  required
                  placeholder="Equipment type"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  data-testid="create-asset-type"
                />
                <input
                  name="manufacturer"
                  placeholder="Manufacturer"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  name="model"
                  placeholder="Model"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  name="serialNumber"
                  placeholder="Serial number"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </fieldset>

              <fieldset className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <legend className="mb-1 text-sm font-semibold text-zinc-900">Location</legend>
                <AssetUnitSpaceFields
                  units={units}
                  spaces={spaceOptions}
                  roomTerm={roomTerm}
                  className="contents"
                />
              </fieldset>

              <fieldset
                className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
                data-testid="asset-responsibility-fields"
              >
                <legend className="mb-1 text-sm font-semibold text-zinc-900">Responsibility</legend>
                <label className="flex flex-col gap-1 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Department user</span>
                  <select
                    name="departmentId"
                    defaultValue=""
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    data-testid="create-asset-department"
                  >
                    <option value="">Defaults from location if possible</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-zinc-500">
                    Department that uses this equipment day to day — even if it sits in a shared
                    location.
                  </span>
                </label>
                <label className="flex flex-col gap-1 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Responsible maintainer</span>
                  <select
                    name="responsibleOrganizationId"
                    defaultValue=""
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    data-testid="create-asset-responsible-org"
                  >
                    <option value="">Not assigned</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-zinc-500">
                    Facility or operating partner obligated to maintain or repair this asset. May
                    differ from the department user.
                  </span>
                </label>
                <label className="flex flex-col gap-1 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Preferred repair vendor</span>
                  <select
                    name="vendorId"
                    defaultValue=""
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    data-testid="create-asset-preferred-provider"
                  >
                    <option value="">No preferred vendor</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-zinc-500">
                    Approved service vendor normally contacted for repair work.
                  </span>
                  {vendors.length === 0 ? (
                    <span className="text-xs text-amber-700">
                      No repair vendors configured.{" "}
                      <Link href="/assets?subtab=vendors" className="underline underline-offset-2">
                        Manage vendors
                      </Link>
                      .
                    </span>
                  ) : null}
                </label>
              </fieldset>

              <fieldset className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <legend className="mb-1 text-sm font-semibold text-zinc-900">
                  Operational importance &amp; lifecycle
                </legend>
                {assetOpsEnabled ? (
                  <label
                    className="flex flex-col gap-1 text-sm text-zinc-700"
                    data-testid="create-asset-lifecycle"
                  >
                    <span className="font-medium text-zinc-900">Lifecycle</span>
                    <select
                      name="lifecycle"
                      defaultValue="ACTIVE"
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                      data-testid="create-asset-status"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="RETIRED">Retired</option>
                    </select>
                  </label>
                ) : (
                  <select
                    name="status"
                    defaultValue="ACTIVE"
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    data-testid="create-asset-status"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="OUT_OF_SERVICE">OUT_OF_SERVICE</option>
                    <option value="RETIRED">RETIRED</option>
                  </select>
                )}
                <label className="flex flex-col gap-1 text-sm text-zinc-700 md:col-span-2 xl:col-span-3">
                  <span className="font-medium text-zinc-900">Operational criticality</span>
                  <select
                    name="criticality"
                    defaultValue={AssetCriticality.ROUTINE}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  >
                    {ASSET_CRITICALITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} — {option.description}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  name="notes"
                  placeholder="Notes"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2 xl:col-span-4"
                />
              </fieldset>

              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
                data-testid="create-asset-submit"
              >
                Add asset
              </button>
            </form>
          </section>
        }
      >
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Configuration registry</h2>
          <div className="mt-3 space-y-2" data-testid="asset-registry">
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
              return (
                <div
                  key={asset.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-200 p-2"
                  data-testid={`asset-row-${asset.id}`}
                  data-asset-lifecycle={presentation.lifecycle}
                >
                  <div className="text-sm text-zinc-700">
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
                    <form action={updateAssetDepartmentAction} className="flex items-center gap-1">
                      <input type="hidden" name="assetId" value={asset.id} />
                      <select
                        name="departmentId"
                        defaultValue={asset.departmentId ?? ""}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                      >
                        <option value="">Unset</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                      >
                        Dept
                      </button>
                    </form>
                    <form action={updateAssetCriticalityAction} className="flex items-center gap-1">
                      <input type="hidden" name="assetId" value={asset.id} />
                      <select
                        name="criticality"
                        defaultValue={asset.criticality}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                      >
                        {ASSET_CRITICALITY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                      >
                        Criticality
                      </button>
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
            {assets.length === 0 ? <p className="text-sm text-zinc-500">No assets yet.</p> : null}
          </div>
        </section>

        <section
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
          data-testid="facility-organizations-panel"
        >
          <h2 className="text-lg font-semibold text-zinc-900">Facility &amp; operating partners</h2>
          <p className="mt-1 text-xs text-zinc-500">
            The facility is always available. Add contracted operating partners here (not repair
            vendors).
          </p>
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
