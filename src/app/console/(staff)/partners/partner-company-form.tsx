"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createPartnerCompanyAction,
  type CreatePartnerCompanyState,
} from "@/app/console/(staff)/partners/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)] disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create company"}
    </button>
  );
}

export function PartnerCompanyForm() {
  const [state, action] = useActionState<CreatePartnerCompanyState, FormData>(
    createPartnerCompanyAction,
    null,
  );

  return (
    <form action={action} className="space-y-4" data-testid="create-partner-company-form">
      <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--foreground)]">Company name</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={200}
          placeholder="Metz Culinary"
          className="rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--foreground)]"
          data-testid="partner-company-name"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--foreground)]">Display name</span>
        <input
          name="displayName"
          maxLength={200}
          placeholder="Shown to facilities. Defaults to the company name."
          className="rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--foreground)]"
          data-testid="partner-company-display-name"
        />
      </label>
      <SubmitButton />
      {state ? (
        <div
          role="status"
          className={`rounded-md border px-3 py-2 text-sm ${
            state.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
          data-testid="partner-company-result"
        >
          <p>{state.message}</p>
          {state.organization ? (
            <p className="mt-1" data-testid="partner-company-created">
              Facilities: {state.organization.facilityCount}. No administrator and no members.
            </p>
          ) : null}
          {state.existing ? (
            <p className="mt-1" data-testid="partner-company-existing">
              Existing company: {state.existing.displayName?.trim() || state.existing.name}
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
