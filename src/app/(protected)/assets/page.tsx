import { AssetCriticality, AssetStatus } from "@prisma/client";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";

import {
  createAssetAction,
  createVendorAction,
  updateAssetCriticalityAction,
  updateAssetDepartmentAction,
  updateAssetStatusAction,
} from "@/app/(protected)/assets/actions";
import { AssetKnowledgeTrigger } from "@/components/knowledge/asset-knowledge-trigger";
import { ASSET_CRITICALITY_OPTIONS, assetCriticalityLabel } from "@/lib/asset-criticality";
import { getSession } from "@/lib/auth";
import { departmentFilterIdsForSession } from "@/lib/department-scope";
import {
  loadContextualKnowledgeByAssetIds,
  toContextualKnowledgeClientArticles,
} from "@/lib/knowledge/contextual";
import { prisma } from "@/lib/prisma";

type AssetsPageProps = {
  searchParams: Promise<{ subtab?: string }>;
};

function parseSubtab(raw: string | undefined): "vendors" | "assets" {
  return raw === "vendors" || raw === "assets" ? raw : "assets";
}

function subtabHref(subtab: "vendors" | "assets") {
  const params = new URLSearchParams();
  params.set("subtab", subtab);
  return `/assets?${params.toString()}`;
}

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  noStore();
  const params = await searchParams;
  const activeSubtab = parseSubtab(typeof params.subtab === "string" ? params.subtab : undefined);

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;

  const [units, vendors, departments, assets] = await Promise.all([
    prisma.unit.findMany({
      where: { isActive: true, facilityId },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.vendor.findMany({
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

  const viewerDepartmentIds = await departmentFilterIdsForSession(session);
  const knowledgeByAsset = await loadContextualKnowledgeByAssetIds({
    facilityId,
    viewerDepartmentIds,
    assetIds: assets.map((asset) => asset.id),
    limitPerAsset: 5,
  });

  const routineDefaultCount = assets.filter((asset) => asset.criticality === AssetCriticality.ROUTINE).length;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Assets</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Register equipment, map assets to units, and track operational status.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3" aria-label="Asset subtabs">
        {[
          { id: "assets" as const, label: "Assets" },
          { id: "vendors" as const, label: "Vendors" },
        ].map(({ id, label }) => {
          const isActive = activeSubtab === id;
          return (
            <Link
              key={id}
              href={subtabHref(id)}
              className={
                isActive
                  ? "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              }
              aria-current={isActive ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </nav>

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
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Add Asset</h2>
            <form action={createAssetAction} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input name="assetCode" required placeholder="Asset code" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input name="name" required placeholder="Asset name" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input name="equipmentType" required placeholder="Equipment type" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <select name="unitId" required className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
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
              <select name="departmentId" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2 xl:col-span-4">
                <option value="">Responsible dept (defaults from unit if possible)</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select name="status" defaultValue={AssetStatus.ACTIVE} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
                {Object.values(AssetStatus).map((value) => (
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
                <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
                  Add asset
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Asset Registry</h2>
            {routineDefaultCount > 0 ? (
              <p className="mt-2 text-xs text-zinc-500">
                {routineDefaultCount} asset{routineDefaultCount === 1 ? "" : "s"} currently classified as Routine
                (the default). Review Critical and Important equipment so Plant readiness stays accurate.
              </p>
            ) : null}
            <div className="mt-3 space-y-2">
              {assets.map((asset) => (
                <div key={asset.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-200 p-2">
                  <div className="text-sm text-zinc-700">
                    <p className="font-medium text-zinc-900">
                      {asset.assetCode} · {asset.name}
                    </p>
                    <p className="text-xs">
                      {asset.equipmentType} · {asset.unit.name} · {asset.vendor?.name ?? "No vendor"}
                      {" · "}
                      {assetCriticalityLabel(asset.criticality)}
                      {" · "}
                      {asset.department?.name ? (
                        <>Dept: {asset.department.name}</>
                      ) : (
                        <span className="text-amber-700">No responsible dept</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AssetKnowledgeTrigger
                      articles={toContextualKnowledgeClientArticles(
                        knowledgeByAsset.get(asset.id) ?? [],
                      )}
                      assetLabel={`${asset.assetCode} · ${asset.name}`}
                    />
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
                    <select name="status" defaultValue={asset.status} className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                      {Object.values(AssetStatus).map((value) => (
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
              ))}
              {assets.length === 0 ? <p className="text-sm text-zinc-500">No assets yet.</p> : null}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
