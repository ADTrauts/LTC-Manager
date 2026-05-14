import { AssetStatus } from "@prisma/client";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";

import {
  createAssetAction,
  createVendorAction,
  updateAssetStatusAction,
} from "@/app/(protected)/assets/actions";
import { getSession } from "@/lib/auth";
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

  const [units, vendors, assets] = await Promise.all([
    prisma.unit.findMany({
      where: { isActive: true, facilityId },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.vendor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.asset.findMany({
      where: { unit: { facilityId } },
      orderBy: { createdAt: "desc" },
      include: {
        unit: { select: { name: true } },
        vendor: { select: { name: true } },
      },
    }),
  ]);

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
              <select name="status" defaultValue={AssetStatus.ACTIVE} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
                {Object.values(AssetStatus).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
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
            <div className="mt-3 space-y-2">
              {assets.map((asset) => (
                <div key={asset.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-200 p-2">
                  <div className="text-sm text-zinc-700">
                    <p className="font-medium text-zinc-900">
                      {asset.assetCode} · {asset.name}
                    </p>
                    <p className="text-xs">
                      {asset.equipmentType} · {asset.unit.name} · {asset.vendor?.name ?? "No vendor"}
                    </p>
                  </div>
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
              ))}
              {assets.length === 0 ? <p className="text-sm text-zinc-500">No assets yet.</p> : null}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
