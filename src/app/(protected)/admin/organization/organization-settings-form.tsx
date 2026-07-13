"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ORGANIZATION_TYPE_OPTIONS } from "@/lib/organization";

import { updateOrganizationSettingsAction } from "./actions";

type OrganizationFields = {
  id: string;
  name: string;
  legalName: string | null;
  displayName: string | null;
  organizationType: string | null;
};

export function OrganizationSettingsForm({ organization }: { organization: OrganizationFields }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await updateOrganizationSettingsAction(formData);
      router.refresh();
    } catch {
      setError("Could not save organization settings.");
    } finally {
      setPending(false);
    }
  }

  const displayDefault = organization.displayName?.trim() || organization.name;

  return (
    <form
      action={onSubmit}
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      data-testid="organization-settings-form"
    >
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Organization</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Parent business entity for this facility. Facility remains the operational and login scope.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="orgDisplayName" className="block text-sm font-medium text-zinc-700">
          Display name
        </label>
        <input
          id="orgDisplayName"
          name="displayName"
          type="text"
          required
          defaultValue={displayDefault}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-900 focus:ring-2"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="legalName" className="block text-sm font-medium text-zinc-700">
          Legal name
        </label>
        <input
          id="legalName"
          name="legalName"
          type="text"
          defaultValue={organization.legalName ?? ""}
          placeholder="Optional legal entity name"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-900 focus:ring-2"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="organizationType" className="block text-sm font-medium text-zinc-700">
          Organization type
        </label>
        <select
          id="organizationType"
          name="organizationType"
          defaultValue={organization.organizationType ?? ""}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-900 focus:ring-2"
        >
          <option value="">Unset</option>
          {ORGANIZATION_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="app-accent-button rounded-md px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {pending ? "Saving…" : "Save organization"}
      </button>
    </form>
  );
}
