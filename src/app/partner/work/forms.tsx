"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addPartnerWorkPlanAction,
  publishPartnerWorkPlanAction,
  type PartnerWorkResult,
} from "@/app/partner/work/actions";

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

function Result({ state }: { state: PartnerWorkResult }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-emerald-800" : "text-amber-800"}`}>
      {state.message}
    </p>
  );
}

export function PartnerWorkForms({
  drafts,
  forms,
}: {
  drafts: Array<{ id: string; name: string }>;
  forms: Array<{ stableKey: string; name: string }>;
}) {
  const [plan, planAction] = useActionState(addPartnerWorkPlanAction, null);
  const [published, publishAction] = useActionState(publishPartnerWorkPlanAction, null);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form action={planAction} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Add a work plan</h2>
        <input name="name" required maxLength={120} placeholder="Plan name" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <input name="stepLabel" required maxLength={160} placeholder="Step" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <select name="catalogStableKey" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">No Catalog Record</option>
          {forms.map((form) => (
            <option key={form.stableKey} value={form.stableKey}>
              {form.name}
            </option>
          ))}
        </select>
        <input name="effectiveStartDate" type="date" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <Submit label="Save draft" />
        <Result state={plan} />
      </form>
      <form action={publishAction} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Publish a draft</h2>
        <select name="workPlanId" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">Draft</option>
          {drafts.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <Submit label="Publish" />
        <Result state={published} />
      </form>
    </div>
  );
}
