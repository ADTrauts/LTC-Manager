"use client";

import { useActionState } from "react";

import {
  createHarborClaimRequestAction,
  type HarborClaimActionResult,
} from "@/app/console/(staff)/organization-claims/actions";

type OrganizationOption = {
  id: string;
  name: string;
  displayName: string | null;
};

function organizationLabel(organization: OrganizationOption): string {
  const display = organization.displayName?.trim();
  return display || organization.name;
}

export function HarborOrganizationClaimRequestForm({
  organizations,
}: {
  organizations: OrganizationOption[];
}) {
  const [state, action] = useActionState<HarborClaimActionResult | null, FormData>(
    createHarborClaimRequestAction,
    null,
  );

  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="block text-sm sm:col-span-2">
        <span className="font-medium text-zinc-900">Organization</span>
        <select
          name="organizationId"
          required
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          defaultValue=""
        >
          <option value="" disabled>
            Select organization…
          </option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {organizationLabel(org)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium text-zinc-900">Contact email</span>
        <input
          type="email"
          name="targetEmail"
          required
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-zinc-900">Contact name</span>
        <input
          type="text"
          name="contactName"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="font-medium text-zinc-900">Notes</span>
        <textarea
          name="notes"
          rows={2}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <div className="sm:col-span-2 space-y-2">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
        >
          Create claim request
        </button>
        {state ? (
          <p
            className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}
            data-testid="harbor-claim-create-result"
            role="status"
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
