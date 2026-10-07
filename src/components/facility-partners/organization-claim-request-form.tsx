"use client";

import { useState, useTransition } from "react";

import {
  requestOrganizationClaimAction,
  type OrganizationClaimActionResult,
} from "@/app/(protected)/admin/organization/partners/claim-actions";

export function OrganizationClaimRequestForm({
  partnershipId,
  organizationId,
}: {
  partnershipId: string;
  organizationId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OrganizationClaimActionResult | null>(null);

  return (
    <form
      className="mt-3 space-y-3"
      data-testid="organization-claim-request-form"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const next = await requestOrganizationClaimAction(formData);
          setResult(next);
          if (next.ok) {
            event.currentTarget.reset();
          }
        });
      }}
    >
      <input type="hidden" name="partnershipId" value={partnershipId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="block text-sm">
        <span className="font-medium text-zinc-900">Contact email</span>
        <input
          type="email"
          name="targetEmail"
          required
          autoComplete="email"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          placeholder="name@company.example"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-zinc-900">Contact name (optional)</span>
        <input
          type="text"
          name="contactName"
          maxLength={120}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-zinc-900">Notes for Harbor (optional)</span>
        <textarea
          name="notes"
          maxLength={500}
          rows={2}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Request organization claim"}
      </button>
      {result ? (
        <p
          className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-700"}`}
          data-testid="organization-claim-request-result"
        >
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
