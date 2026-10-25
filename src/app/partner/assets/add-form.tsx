"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { addPartnerAssetAction, type PartnerAssetResult } from "@/app/partner/assets/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Saving…" : "Add asset"}
    </button>
  );
}

export function PartnerAssetForm({
  places,
  maintainers,
  vendors,
}: {
  places: Array<{ id: string; name: string }>;
  maintainers: Array<{ id: string; name: string }>;
  vendors: Array<{ id: string; name: string; ownerOrganizationId: string | null }>;
}) {
  const [state, action] = useActionState<PartnerAssetResult, FormData>(addPartnerAssetAction, null);
  return (
    <form action={action} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4" data-testid="partner-add-asset">
      <h2 className="text-sm font-semibold">Add equipment</h2>
      <p className="text-xs text-zinc-500">It sits in a room the facility already assigned to this Department.</p>
      <input name="name" required placeholder="Name" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
      <input name="equipmentType" required placeholder="Equipment type" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
      <select name="unitId" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
        <option value="">Room</option>
        {places.map((place) => (
          <option key={place.id} value={place.id}>
            {place.name}
          </option>
        ))}
      </select>
      <select name="title" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
        <option value="FACILITY">Owned by the facility</option>
        <option value="PARTNER">Owned by our company</option>
      </select>
      <select name="responsibleOrganizationId" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
        <option value="">Maintainer</option>
        {maintainers.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      <select name="vendorId" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
        <option value="">Repair vendor</option>
        {vendors.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      <Submit />
      {state ? (
        <p role="status" className={`text-sm ${state.ok ? "text-emerald-800" : "text-amber-800"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
