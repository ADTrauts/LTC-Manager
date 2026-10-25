"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  invitePartnerAdministratorAction,
  invitePartnerMemberAction,
  type PartnerInviteState,
} from "@/app/console/(staff)/partners/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--run-aside)] px-3 text-sm font-semibold text-[var(--run-aside-fg)] disabled:opacity-60"
    >
      {pending ? "Sending…" : label}
    </button>
  );
}

function Result({ state }: { state: PartnerInviteState }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className={`text-sm ${state.ok ? "text-emerald-800" : "text-amber-800"}`}
      data-testid="partner-invite-result"
    >
      {state.message}
    </p>
  );
}

export function PartnerInviteForms({ organizationId }: { organizationId: string }) {
  const [adminState, adminAction] = useActionState<PartnerInviteState, FormData>(
    invitePartnerAdministratorAction,
    null,
  );
  const [memberState, memberAction] = useActionState<PartnerInviteState, FormData>(
    invitePartnerMemberAction,
    null,
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form action={adminAction} className="space-y-2" data-testid="invite-partner-administrator-form">
        <input type="hidden" name="organizationId" value={organizationId} />
        <p className="text-sm font-medium text-[var(--foreground)]">First Organization Administrator</p>
        <input
          name="contactName"
          placeholder="Name"
          maxLength={200}
          className="w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm"
        />
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm"
          data-testid="partner-admin-email"
        />
        <SubmitButton label="Send administrator invitation" />
        <Result state={adminState} />
      </form>
      <form action={memberAction} className="space-y-2" data-testid="invite-partner-member-form">
        <input type="hidden" name="organizationId" value={organizationId} />
        <p className="text-sm font-medium text-[var(--foreground)]">Member</p>
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm"
          data-testid="partner-member-email"
        />
        <SubmitButton label="Send member invitation" />
        <Result state={memberState} />
      </form>
    </div>
  );
}
