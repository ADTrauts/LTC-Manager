"use client";

import { useActionState } from "react";

import {
  createFacilityCatalogFormAction,
  publishFacilityCatalogFormAction,
  type FacilityFormActionResult,
} from "./facility-form-actions";

export function FacilityFormPanel({
  departmentId,
  drafts,
}: {
  departmentId: string;
  drafts: Array<{ id: string; name: string; status: string }>;
}) {
  const [createState, createAction, creating] = useActionState<FacilityFormActionResult | null, FormData>(
    createFacilityCatalogFormAction,
    null,
  );
  return (
    <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4" data-testid="facility-forms">
      <h2 className="text-sm font-semibold text-zinc-900">Department forms</h2>
      <p className="mt-1 text-sm text-zinc-600">
        A form you build belongs to this facility. Other facilities cannot see it.
      </p>
      <form action={createAction} className="mt-3 space-y-2">
        <input type="hidden" name="departmentId" value={departmentId} />
        <label className="block text-sm text-zinc-700">
          Name
          <input name="name" required className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="block text-sm text-zinc-700">
          Field
          <input
            name="fieldLabel"
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {creating ? "Saving…" : "Add form"}
        </button>
        {createState ? (
          <p className={`text-sm ${createState.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
            {createState.message}
          </p>
        ) : null}
      </form>
      <ul className="mt-4 space-y-2">
        {drafts.map((form) => (
          <li key={form.id} className="flex items-center justify-between gap-3 text-sm">
            <span>
              {form.name}
              <span className="ml-2 text-zinc-500">{form.status === "PUBLISHED" ? "Published" : "Draft"}</span>
            </span>
            {form.status === "DRAFT" ? (
              <PublishButton departmentId={departmentId} definitionId={form.id} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PublishButton({ departmentId, definitionId }: { departmentId: string; definitionId: string }) {
  const [state, action, pending] = useActionState<FacilityFormActionResult | null, FormData>(
    publishFacilityCatalogFormAction,
    null,
  );
  return (
    <form action={action}>
      <input type="hidden" name="departmentId" value={departmentId} />
      <input type="hidden" name="definitionId" value={definitionId} />
      <button type="submit" disabled={pending} className="text-xs underline-offset-2 hover:underline">
        {pending ? "Publishing…" : "Publish"}
      </button>
      {state && !state.ok ? <span className="ml-2 text-xs text-red-700">{state.message}</span> : null}
    </form>
  );
}
