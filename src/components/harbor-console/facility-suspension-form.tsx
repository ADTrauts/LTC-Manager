"use client";

import { useActionState } from "react";
import { changeFacilitySuspensionAction } from "@/app/console/(staff)/customers/actions";

export function FacilitySuspensionForm({ facilityId, facilityName, suspended, revision, requestKey }: {
  facilityId: string; facilityName: string; suspended: boolean; revision: number; requestKey: string;
}) {
  const [state, action, pending] = useActionState(changeFacilitySuspensionAction, null);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="facilityId" value={facilityId} />
    <input type="hidden" name="operation" value={suspended ? "reactivate" : "suspend"} />
    <input type="hidden" name="expectedRevision" value={revision} />
    <input type="hidden" name="requestKey" value={requestKey} />
    <p className="text-sm">{suspended
      ? "Remove the manual operational pause. Billing, customer access and security restrictions keep their existing rules."
      : "Pause operational changes across this Facility. Existing data, Administrator sign-in, billing and Support remain available. This does not cancel a subscription or delete data."}</p>
    <fieldset disabled={pending} className="space-y-3">
      <div><label htmlFor="suspension-reason" className="block text-sm font-medium">Reason for {suspended ? "reactivation" : "suspension"}</label>
        <textarea id="suspension-reason" name="reason" required maxLength={1000} rows={3} className="w-full rounded border border-[var(--border)] bg-[var(--surface)] p-2" />
        <p className="text-xs text-[var(--text-secondary)]">Recorded in the restricted OWNER history. Do not include passwords or personal medical information.</p></div>
      <div><label htmlFor="suspension-name" className="block text-sm font-medium">Enter the Facility name: {facilityName}</label>
        <input id="suspension-name" name="confirmationName" required maxLength={200} autoComplete="off" className="w-full rounded border border-[var(--border)] bg-[var(--surface)] p-2" /></div>
      <div><label htmlFor="suspension-password" className="block text-sm font-medium">Your current OWNER password</label>
        <input id="suspension-password" name="password" type="password" required maxLength={128} autoComplete="current-password" className="w-full rounded border border-[var(--border)] bg-[var(--surface)] p-2" /></div>
      <button type="submit" className="rounded border border-[var(--border)] px-4 py-2 font-semibold disabled:opacity-50">{pending ? "Saving…" : suspended ? "Reactivate operational changes" : "Suspend operational changes"}</button>
    </fieldset>
    {state ? <p role={state.ok ? "status" : "alert"} className="text-sm">{state.ok ? state.message : state.error}</p> : null}
  </form>;
}
