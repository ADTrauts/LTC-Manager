"use client";

import { useActionState } from "react";

import {
  createVendorPinWorkforceAction,
  type VendorPeopleActionResult,
} from "@/app/partner/people/actions";

export function VendorPinForm() {
  const [state, action, pending] = useActionState<VendorPeopleActionResult | null, FormData>(
    createVendorPinWorkforceAction,
    null,
  );
  return (
    <form action={action} className="space-y-3" data-testid="vendor-pin-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-zinc-700">
          First name
          <input
            name="firstName"
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-sm text-zinc-700">
          Last name
          <input
            name="lastName"
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <label className="block text-sm text-zinc-700">
        PIN
        <input
          name="pin"
          required
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{6}"
          className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Add staff"}
      </button>
      {state ? (
        <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
