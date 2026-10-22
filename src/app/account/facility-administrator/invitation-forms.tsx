"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { FacilityAdministratorActionResult } from "@/lib/facility-administrator/action-result";

import {
  acceptFacilityAdministratorInvitationAction,
  declineFacilityAdministratorInvitationAction,
} from "./actions";

export function InvitationAnswerForms({ invitationId }: { invitationId: string }) {
  const [accepted, acceptAction, accepting] = useActionState<FacilityAdministratorActionResult | null, FormData>(
    acceptFacilityAdministratorInvitationAction,
    null,
  );
  const [declined, declineAction, declining] = useActionState<FacilityAdministratorActionResult | null, FormData>(
    declineFacilityAdministratorInvitationAction,
    null,
  );
  const state = accepted ?? declined;
  const busy = accepting || declining;

  if (state?.ok) {
    return (
      <div className="mt-3 space-y-1" role="status" data-testid="facility-administrator-answer-message">
        <p className="text-sm text-emerald-700">{state.message}</p>
        {accepted?.ok ? (
          <Link href="/access" className="text-sm font-medium text-zinc-900 underline underline-offset-2">
            Open the facility from My Access
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={acceptAction}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Accept and become Facility Administrator
          </button>
        </form>
        <form action={declineAction}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
          >
            Decline
          </button>
        </form>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-red-700" role="status" data-testid="facility-administrator-answer-message">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
