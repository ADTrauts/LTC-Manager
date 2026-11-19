"use client";

import { useActionState } from "react";
import Link from "next/link";

import { resendHarborProvisionInviteAction } from "@/app/console/(staff)/customers/provision-actions";
import type { HarborAdministratorInviteTarget } from "@/lib/harbor-console/administrator-activation";

export function AdministratorInviteRecoveryForm({ facilityId, target }: { facilityId: string; target: HarborAdministratorInviteTarget }) {
  const [state, action, pending] = useActionState(resendHarborProvisionInviteAction, null);
  return (
    <form action={action} className="mt-3 space-y-2 text-sm">
      <input type="hidden" name="facilityId" value={facilityId} />
      <input type="hidden" name="userId" value={target.userId} />
      <input type="hidden" name="periodId" value={target.periodId} />
      <input type="hidden" name="email" value={target.email} />
      <p id="administrator-replacement-help" className="text-xs text-[var(--text-secondary)]">
        A replacement invitation invalidates any unused link for this account.
      </p>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="confirmReplacement" value="1" required aria-describedby="administrator-replacement-help" />
        <span>I confirm a replacement invitation for the current Facility Administrator: <strong>{target.email}</strong>.</span>
      </label>
      <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-3 font-semibold disabled:opacity-60">
        {pending ? "Preparing invitation…" : "Send replacement invitation"}
      </button>
      {state ? <p role="status" className={state.ok ? undefined : "text-red-700"}>{state.message}</p> : null}
      {state ? <p><Link prefetch={false} href={`/console/customers/${encodeURIComponent(facilityId)}/lifecycle`} className="underline underline-offset-2">Review current Administrator and setup status</Link></p> : null}
    </form>
  );
}
