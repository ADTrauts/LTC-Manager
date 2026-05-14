"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateFacilitySettingsAction } from "./actions";

type Facility = {
  id: string;
  displayName: string;
  managementCompanyName: string | null;
  brandColor: string | null;
};

export function FacilitySettingsForm({ facility }: { facility: Facility }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await updateFacilitySettingsAction(formData);
      router.refresh();
    } catch {
      setError("Could not save settings.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      action={onSubmit}
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <div className="space-y-2">
        <label htmlFor="displayName" className="block text-sm font-medium text-zinc-700">
          Facility name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          defaultValue={facility.displayName}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-900 focus:ring-2"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="managementCompanyName" className="block text-sm font-medium text-zinc-700">
          Management company
        </label>
        <input
          id="managementCompanyName"
          name="managementCompanyName"
          type="text"
          defaultValue={facility.managementCompanyName ?? ""}
          placeholder="e.g. contracted food service operator"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-900 focus:ring-2"
        />
        <p className="text-xs text-zinc-500">Optional. Shown in the footer when set.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="brandColor" className="block text-sm font-medium text-zinc-700">
          Brand accent color
        </label>
        <div className="flex items-center gap-3">
          <input
            id="brandColor"
            name="brandColor"
            type="color"
            defaultValue={facility.brandColor ?? "#18181b"}
            className="h-10 w-16 rounded-md border border-zinc-300 p-1"
          />
          <p className="text-xs text-zinc-500">
            Used for subtle separators, active nav states, and primary buttons throughout the app.
          </p>
        </div>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="app-accent-button rounded-md px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
