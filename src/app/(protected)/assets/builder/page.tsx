import { AssetCriticality, AssetStatus } from "@prisma/client";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";

import {
  createAssetAction,
  updateAssetCriticalityAction,
  updateAssetDepartmentAction,
  updateAssetStatusAction,
} from "@/app/(protected)/assets/actions";
import { BuildBreadcrumb, BackToBuildHomeLink } from "@/components/build/build-breadcrumb";
import { ASSET_CRITICALITY_OPTIONS, assetCriticalityLabel } from "@/lib/asset-criticality";
import { assetStatusLabel, normalizeAssetStatus } from "@/lib/asset-operations";
import { getSession } from "@/lib/auth";
import { isDietaryAssetOperationsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

import { AssetBuilderClient } from "./asset-builder-client";

/**
 * BUILD · Asset Builder — the canonical asset-configuration surface.
 *
 * It reuses the single asset registry and the same server actions the RUN Assets area uses; it adds
 * no new authority. The platform route registry enforces the SUPERVISOR floor and department scope,
 * so this page appears on Build Home only for users already authorized to configure assets.
 */
const ASSET_OPS_STATUS_OPTIONS = ["OPERATIONAL", "DEGRADED", "OUT_OF_SERVICE", "RETIRED"] as const;

export default async function AssetBuilderPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;
  const assetOpsEnabled = isDietaryAssetOperationsEnabled();

  const [units, vendors, departments, assets] = await Promise.all([
    prisma.unit.findMany({
      where: { isActive: true, facilityId },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.vendor.findMany({
      where: { facilityId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
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
        vendor: { select: { name: true } },
        department: { select: { name: true } },
      },
    }),
  ]);

  const statusOptions = assetOpsEnabled
    ? ASSET_OPS_STATUS_OPTIONS
    : (Object.values(AssetStatus) as string[]);
  const defaultStatus = assetOpsEnabled ? "OPERATIONAL" : AssetStatus.ACTIVE;

  return (
    <section className="space-y-6" data-testid="asset-builder-page">
      <BuildBreadcrumb current="Asset Builder" />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Asset Builder</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Register equipment and configure asset identity, responsible department, criticality, and
            status. Assets configured here are the same registry the operational Assets view uses.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/assets"
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Open operational Assets
          </Link>
          <BackToBuildHomeLink />
        </div>
      </header>

      <AssetBuilderClient isEmpty={assets.length === 0}>
      <section id="asset-builder-add" className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-builder">
        <h2 className="text-lg font-semibold text-zinc-900">Add Asset</h2>
        <form action={createAssetAction} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input name="assetCode" required placeholder="Asset code" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" data-testid="create-asset-code" />
          <input name="name" required placeholder="Asset name" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" data-testid="create-asset-name" />
          <input name="equipmentType" required placeholder="Equipment type" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" data-testid="create-asset-type" />
          <select name="unitId" required className="rounded-md border border-zinc-300 px-3 py-2 text-sm" data-testid="create-asset-unit">
            <option value="">Select unit</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <input name="model" placeholder="Model" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          <input name="serialNumber" placeholder="Serial number" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          <select name="vendorId" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="">No vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
          <select name="departmentId" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2 xl:col-span-4" data-testid="create-asset-department">
            <option value="">Responsible dept (defaults from unit if possible)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={defaultStatus} className="rounded-md border border-zinc-300 px-3 py-2 text-sm" data-testid="create-asset-status">
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 md:col-span-2 xl:col-span-4">
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
            <span className="text-xs text-zinc-500">
              Defaults to Routine. Classify essential equipment so Plant readiness can prioritize real operational risk.
            </span>
          </label>
          <input name="notes" placeholder="Notes" className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2 xl:col-span-4" />
          <div className="md:col-span-2 xl:col-span-4">
            <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700" data-testid="create-asset-submit">
              Add asset
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Asset Registry</h2>
        <div className="mt-3 space-y-2" data-testid="asset-registry">
          {assets.map((asset) => {
            const statusDisplay = assetOpsEnabled ? assetStatusLabel(asset.status) : asset.status;
            const normalized = normalizeAssetStatus(asset.status);
            return (
              <div key={asset.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-200 p-2" data-testid={`asset-row-${asset.id}`} data-asset-status={normalized}>
                <div className="text-sm text-zinc-700">
                  <p className="font-medium text-zinc-900">
                    {asset.assetCode} · {asset.name}
                  </p>
                  <p className="text-xs">
                    {asset.equipmentType} · {asset.unit.name} · {asset.vendor?.name ?? "No vendor"}
                    {" · "}
                    {assetCriticalityLabel(asset.criticality)}
                    {" · "}
                    <span data-testid={`asset-status-label-${asset.id}`}>{statusDisplay}</span>
                    {" · "}
                    {asset.department?.name ? (
                      <>Dept: {asset.department.name}</>
                    ) : (
                      <span className="text-amber-700">No responsible dept</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={updateAssetDepartmentAction} className="flex items-center gap-1">
                    <input type="hidden" name="assetId" value={asset.id} />
                    <select name="departmentId" defaultValue={asset.departmentId ?? ""} className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                      <option value="">Unset</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
                      Dept
                    </button>
                  </form>
                  <form action={updateAssetCriticalityAction} className="flex items-center gap-1">
                    <input type="hidden" name="assetId" value={asset.id} />
                    <select
                      name="criticality"
                      defaultValue={asset.criticality}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                      title={ASSET_CRITICALITY_OPTIONS.find((o) => o.value === asset.criticality)?.description}
                    >
                      {ASSET_CRITICALITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
                      Criticality
                    </button>
                  </form>
                  <form action={updateAssetStatusAction} className="flex items-center gap-2">
                    <input type="hidden" name="assetId" value={asset.id} />
                    {asset.departmentId ? (
                      <input type="hidden" name="departmentId" value={asset.departmentId} />
                    ) : null}
                    <select name="status" defaultValue={assetOpsEnabled ? normalized : asset.status} className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                      {statusOptions.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
                      Update
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
          {assets.length === 0 ? <p className="text-sm text-zinc-500">No assets yet.</p> : null}
        </div>
      </section>
      </AssetBuilderClient>
    </section>
  );
}
