"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addPartnerMenuAction,
  assignPartnerMenuAction,
  type PartnerMenuResult,
} from "@/app/partner/menus/actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function Result({ state }: { state: PartnerMenuResult }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-emerald-800" : "text-amber-800"}`}>
      {state.message}
    </p>
  );
}

export function PartnerMenuForms({
  menus,
  locations,
  cycles,
  periods,
}: {
  menus: Array<{ id: string; name: string }>;
  locations: Array<{ key: string; name: string }>;
  cycles: Array<{ stableKey: string; label: string }>;
  periods: Array<{ key: string; label: string }>;
}) {
  const [created, createAction] = useActionState(addPartnerMenuAction, null);
  const [assigned, assignAction] = useActionState(assignPartnerMenuAction, null);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form action={createAction} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Add a menu</h2>
        <input name="name" required maxLength={120} placeholder="Menu name" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <Submit label="Create menu" />
        <Result state={created} />
      </form>
      <form action={assignAction} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Attach it</h2>
        <select name="menuId" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">Menu</option>
          {menus.map((menu) => (
            <option key={menu.id} value={menu.id}>
              {menu.name}
            </option>
          ))}
        </select>
        <select name="locationKey" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">Location</option>
          {locations.map((location) => (
            <option key={location.key} value={location.key}>
              {location.name}
            </option>
          ))}
        </select>
        <select name="cycleStableKey" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">Published cycle</option>
          {cycles.map((cycle) => (
            <option key={cycle.stableKey} value={cycle.stableKey}>
              {cycle.label}
            </option>
          ))}
        </select>
        <select name="menuPeriodKey" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          {periods.map((period) => (
            <option key={period.key} value={period.key}>
              {period.label}
            </option>
          ))}
        </select>
        <Submit label="Attach menu" />
        <Result state={assigned} />
      </form>
    </div>
  );
}
