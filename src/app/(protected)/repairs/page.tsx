import { RepairPriority, RepairStatus } from "@prisma/client";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import {
  addRepairUpdateAction,
  createRepairAction,
} from "@/app/(protected)/repairs/actions";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function RepairsPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;

  const [units, assets, vendors, repairs] = await Promise.all([
    prisma.unit.findMany({
      where: { isActive: true, facilityId },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.asset.findMany({
      where: { unit: { facilityId } },
      orderBy: { assetCode: "asc" },
      select: { id: true, assetCode: true, name: true },
    }),
    prisma.vendor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.repair.findMany({
      where: { unit: { facilityId } },
      orderBy: { createdAt: "desc" },
      include: {
        unit: { select: { name: true } },
        asset: { select: { assetCode: true, name: true } },
        vendor: { select: { name: true } },
        reportedBy: { select: { displayName: true } },
      },
    }),
  ]);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Repairs</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Track repair tickets from intake to closure with status updates.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Create Repair Ticket</h2>
        <form action={createRepairAction} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select name="unitId" required className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="">Select unit</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <select name="assetId" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="">No asset linked</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.assetCode} · {asset.name}
              </option>
            ))}
          </select>
          <select name="vendorId" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="">No vendor assigned</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
          <select name="priority" defaultValue={RepairPriority.MEDIUM} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            {Object.values(RepairPriority).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <input name="title" required placeholder="Issue title" className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2" />
          <textarea
            name="description"
            required
            placeholder="Describe the issue"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2 xl:col-span-4"
            rows={3}
          />
          <div className="md:col-span-2 xl:col-span-4">
            <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Create repair
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Repair Board</h2>
        <div className="mt-3 space-y-3">
          {repairs.map((repair) => (
            <article key={repair.id} className="rounded-lg border border-zinc-200 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    {repair.repairCode} · {repair.title}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {repair.unit.name}
                    {repair.asset ? ` · ${repair.asset.assetCode}` : ""}
                    {repair.vendor ? ` · ${repair.vendor.name}` : ""}
                    {repair.reportedBy ? ` · by ${repair.reportedBy.displayName}` : ""}
                  </p>
                </div>
                <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                  {repair.priority} · {repair.status}
                </span>
              </div>
              <p className="mb-3 text-sm text-zinc-700">{repair.description}</p>
              <form action={addRepairUpdateAction} className="grid gap-2 md:grid-cols-4">
                <input type="hidden" name="repairId" value={repair.id} />
                <input
                  name="updateText"
                  required
                  placeholder="Add update note"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-xs md:col-span-3"
                />
                <select name="statusAfterUpdate" defaultValue={repair.status} className="rounded-md border border-zinc-300 px-3 py-2 text-xs">
                  {Object.values(RepairStatus).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <div className="md:col-span-4">
                  <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100">
                    Add update
                  </button>
                </div>
              </form>
            </article>
          ))}
          {repairs.length === 0 ? (
            <p className="text-sm text-zinc-500">No repairs yet.</p>
          ) : null}
        </div>
      </section>
    </section>
  );
}
