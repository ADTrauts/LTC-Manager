"use client";

import type { RoleKey } from "@prisma/client";
import { useActionState } from "react";

import type { FacilityAdministratorActionResult } from "@/lib/facility-administrator/action-result";

import {
  cancelFacilityAdministratorTransferAction,
  inviteFacilityAdministratorSuccessorAction,
} from "./actions";

function ActionMessage({ state }: { state: FacilityAdministratorActionResult | null }) {
  if (!state) return null;
  return (
    <p
      className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}
      role="status"
      data-testid="facility-administrator-action-message"
    >
      {state.message}
    </p>
  );
}

export function TransferSection({
  open,
  candidates,
  roleChoices,
  defaultRole,
}: {
  open: boolean;
  candidates: { userId: string; label: string }[];
  roleChoices: { value: RoleKey; label: string }[];
  defaultRole: RoleKey;
}) {
  const [state, formAction, sending] = useActionState<FacilityAdministratorActionResult | null, FormData>(
    inviteFacilityAdministratorSuccessorAction,
    null,
  );
  // Rendered while an invitation is pending too, so the send result survives the page refresh.
  if (!open) return state?.ok ? <ActionMessage state={state} /> : null;
  return (
    <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
      <h2 className="text-sm font-semibold text-zinc-900">Transfer the role</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Choose someone who already has an account at this facility; add new people in People first. Nothing
        changes until they accept. You keep any Department head roles.
      </p>
      {candidates.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600" data-testid="facility-administrator-no-candidates">
          Nobody else has an active account here yet.
        </p>
      ) : (
        <TransferInvitationForm
          formAction={formAction}
          sending={sending}
          state={state}
          candidates={candidates}
          roleChoices={roleChoices}
          defaultRole={defaultRole}
        />
      )}
    </section>
  );
}

function TransferInvitationForm({
  formAction,
  sending,
  state,
  candidates,
  roleChoices,
  defaultRole,
}: {
  formAction: (formData: FormData) => void;
  sending: boolean;
  state: FacilityAdministratorActionResult | null;
  candidates: { userId: string; label: string }[];
  roleChoices: { value: RoleKey; label: string }[];
  defaultRole: RoleKey;
}) {
  return (
    <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="facility-administrator-transfer-form">
      <label className="block text-sm">
        <span className="font-medium text-zinc-900">New Facility Administrator</span>
        <select
          name="invitedUserId"
          required
          defaultValue=""
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Choose a person
          </option>
          {candidates.map((candidate) => (
            <option key={candidate.userId} value={candidate.userId}>
              {candidate.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium text-zinc-900">Your role after the transfer</span>
        <select
          name="outgoingRoleKey"
          defaultValue={defaultRole}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          {roleChoices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-2 sm:col-span-2">
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Send invitation
        </button>
        {state && !state.ok ? <ActionMessage state={state} /> : null}
      </div>
    </form>
  );
}

export function CancelTransferForm({ invitationId }: { invitationId: string }) {
  const [state, formAction, pending] = useActionState<FacilityAdministratorActionResult | null, FormData>(
    cancelFacilityAdministratorTransferAction,
    null,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
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
