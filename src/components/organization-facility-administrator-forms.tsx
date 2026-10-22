"use client";

import { useActionState } from "react";

import {
  appointFacilityAdministratorAction,
  cancelFacilityAdministratorRecoveryAction,
} from "@/app/(organization-account)/organization/facility-administrator-actions";
import type { FacilityAdministratorActionResult } from "@/lib/facility-administrator/action-result";

function ActionMessage({ state }: { state: FacilityAdministratorActionResult | null }) {
  if (!state) return null;
  return (
    <p
      className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}
      role="status"
      data-testid="organization-facility-administrator-message"
    >
      {state.message}
    </p>
  );
}

export function AppointFacilityAdministratorForm({
  organizationId,
  facilityId,
  open,
}: {
  organizationId: string;
  facilityId: string;
  open: boolean;
}) {
  const [state, formAction, pending] = useActionState<FacilityAdministratorActionResult | null, FormData>(
    appointFacilityAdministratorAction.bind(null, organizationId),
    null,
  );
  // Rendered while an invitation is pending too, so the send result survives the page refresh.
  if (!open) return state?.ok ? <ActionMessage state={state} /> : null;
  return (
    <form action={formAction} className="mt-3 space-y-2" data-testid="organization-appoint-administrator-form">
      <input type="hidden" name="facilityId" value={facilityId} />
      <label className="block text-sm">
        <span className="font-medium text-zinc-900">Appoint by email</span>
        <input
          type="email"
          name="invitedEmail"
          required
          placeholder="Someone with an active account at this facility"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        Send invitation
      </button>
      {state && !state.ok ? <ActionMessage state={state} /> : null}
    </form>
  );
}

export function CancelRecoveryForm({ organizationId, invitationId }: { organizationId: string; invitationId: string }) {
  const [state, formAction, pending] = useActionState<FacilityAdministratorActionResult | null, FormData>(
    cancelFacilityAdministratorRecoveryAction.bind(null, organizationId),
    null,
  );
  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="invitationId" value={invitationId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
      >
        Cancel invitation
      </button>
      <ActionMessage state={state} />
    </form>
  );
}
