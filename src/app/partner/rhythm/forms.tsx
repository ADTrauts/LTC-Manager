"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addPartnerCycleAction,
  addPartnerKeyPointAction,
  addPartnerPhaseAction,
  publishPartnerCycleAction,
  type PartnerRhythmResult,
} from "@/app/partner/rhythm/actions";

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

function Result({ state }: { state: PartnerRhythmResult }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-emerald-800" : "text-amber-800"}`}>
      {state.message}
    </p>
  );
}

export function PartnerRhythmForms({
  drafts,
}: {
  drafts: Array<{ id: string; stableKey: string; label: string }>;
}) {
  const [cycle, cycleAction] = useActionState(addPartnerCycleAction, null);
  const [phase, phaseAction] = useActionState(addPartnerPhaseAction, null);
  const [point, pointAction] = useActionState(addPartnerKeyPointAction, null);
  const [published, publishAction] = useActionState(publishPartnerCycleAction, null);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form action={cycleAction} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Add a cycle</h2>
        <p className="text-xs text-zinc-500">Applies to the whole Department. It does not add rooms.</p>
        <input name="label" required maxLength={80} placeholder="Name" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <input name="effectiveFrom" type="date" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <input name="startLocal" type="time" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          <input name="endLocal" type="time" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        </div>
        <Submit label="Save draft cycle" />
        <Result state={cycle} />
      </form>
      <form action={phaseAction} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Add a phase</h2>
        <select name="parentStableKey" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">Draft cycle</option>
          {drafts.map((row) => (
            <option key={row.stableKey} value={row.stableKey}>
              {row.label}
            </option>
          ))}
        </select>
        <input name="label" required maxLength={80} placeholder="Phase name" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <input name="effectiveFrom" type="date" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <input name="startLocal" type="time" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          <input name="endLocal" type="time" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        </div>
        <Submit label="Save phase" />
        <Result state={phase} />
      </form>
      <form action={pointAction} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Add a key point</h2>
        <select name="parentStableKey" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">Draft cycle</option>
          {drafts.map((row) => (
            <option key={row.stableKey} value={row.stableKey}>
              {row.label}
            </option>
          ))}
        </select>
        <input name="label" required maxLength={80} placeholder="Key point" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <input name="dueLocal" type="time" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <Submit label="Save key point" />
        <Result state={point} />
      </form>
      <form action={publishAction} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Publish a draft</h2>
        <select name="cycleId" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">Draft</option>
          {drafts.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
        <Submit label="Publish" />
        <Result state={published} />
      </form>
    </div>
  );
}
