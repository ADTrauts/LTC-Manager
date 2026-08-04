import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { RepairPriority, RepairTrade, RoomAreaOperationalStatus } from "@prisma/client";
import { redirect } from "next/navigation";

import { createEvsRepairTicketAction } from "@/app/(protected)/repairs/actions";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setRoomAreaStatusAction } from "./actions";

const repairTradeLabels: Record<RepairTrade, string> = {
  EQUIPMENT: "Equipment / servery",
  PLUMBING: "Plumbing",
  ELECTRICAL: "Electrical",
  GENERAL: "General / housekeeping",
};

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function EvsBoardPage() {
  noStore();
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const facilityId = session.facilityId;
  const day = todayDateOnly();

  const [units, assets, departments] = await Promise.all([
    prisma.unit.findMany({
      where: {
        facilityId,
        isActive: true,
        departmentResponsibilities: { some: { department: { key: "EVS" } } },
      },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        name: true,
        unitType: true,
        parentUnit: { select: { name: true } },
        roomAreaStatuses: {
          where: { statusDate: day },
          take: 1,
          select: { id: true, status: true, notes: true },
        },
      },
    }),
    prisma.asset.findMany({
      where: { unit: { facilityId } },
      orderBy: { assetCode: "asc" },
      select: { id: true, assetCode: true, name: true, unitId: true },
    }),
    prisma.department.findMany({
      where: { facilityId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const statusOptions = Object.values(RoomAreaOperationalStatus);

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">EVS board</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Room and zone status for units linked to Environmental Services. Updates apply to today&apos;s date only.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Submit maintenance ticket</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Opens a corrective work order with Environmental Services as the requesting department. Responsible
          ownership defaults from trade, unit, and asset settings; override only if you need to steer the ticket.
        </p>
        <form action={createEvsRepairTicketAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <select name="unitId" required className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2">
            <option value="">Select location</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <select name="assetId" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2">
            <option value="">No asset linked</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.assetCode} · {asset.name}
              </option>
            ))}
          </select>
          <select
            name="repairTrade"
            defaultValue={RepairTrade.GENERAL}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {Object.values(RepairTrade).map((value) => (
              <option key={value} value={value}>
                {repairTradeLabels[value]}
              </option>
            ))}
          </select>
          <select
            name="priority"
            defaultValue={RepairPriority.MEDIUM}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {Object.values(RepairPriority).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select name="responsibleDepartmentId" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2">
            <option value="">Responsible dept (optional — uses routing defaults)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            name="title"
            required
            placeholder="Short issue title"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2"
          />
          <textarea
            name="description"
            required
            placeholder="What needs attention?"
            rows={3}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2"
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Due (optional)</span>
            <input name="dueAt" type="datetime-local" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Est. labor (min)</span>
            <input
              name="estimatedLaborMinutes"
              type="number"
              min={1}
              placeholder="Optional"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <textarea
            name="partsNote"
            placeholder="Parts / materials notes (optional)"
            rows={2}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2"
          />
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Submit ticket
            </button>
          </div>
        </form>
      </section>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
            <tr>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Today status</th>
              <th className="px-4 py-3">Set status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {units.map((unit) => {
              const current = unit.roomAreaStatuses[0];
              return (
                <tr key={unit.id}>
                  <td className="px-4 py-3 text-zinc-900">
                    <div className="font-medium">{unit.name}</div>
                    {unit.parentUnit ? (
                      <div className="text-xs text-zinc-500">Under {unit.parentUnit.name}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{unit.unitType}</td>
                  <td className="px-4 py-3 text-zinc-700">
                    {current ? (
                      <>
                        <span className="font-medium">{current.status}</span>
                        {current.notes ? <div className="text-xs text-zinc-500">{current.notes}</div> : null}
                      </>
                    ) : (
                      <span className="text-zinc-400">Not set</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <form action={setRoomAreaStatusAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="unitId" value={unit.id} />
                      <select
                        name="status"
                        defaultValue={current?.status ?? RoomAreaOperationalStatus.CLEAN}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                      >
                        {statusOptions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <input
                        name="notes"
                        placeholder="Notes"
                        className="min-w-[8rem] flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs"
                      />
                      <button
                        type="submit"
                        className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700"
                      >
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {units.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">
            No EVS-scoped units yet. Link Environmental Services to a unit under{" "}
            <Link href="/units" className="text-zinc-900 underline">
              Units
            </Link>
            .
          </p>
        ) : null}
      </div>
    </section>
  );
}
