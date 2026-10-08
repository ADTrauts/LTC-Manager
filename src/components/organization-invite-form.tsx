"use client";

import { useActionState } from "react";

import {
  inviteOrganizationMemberAction,
  type OrganizationAdminActionResult,
} from "@/app/(organization-account)/organization/actions";

export function OrganizationInviteForm({ organizationId }: { organizationId: string }) {
  const action = inviteOrganizationMemberAction.bind(null, organizationId);
  const [state, formAction] = useActionState<OrganizationAdminActionResult | null, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="font-medium text-zinc-900">Email</span>
        <input
          type="email"
          name="targetEmail"
          required
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-zinc-900">Organization role</span>
        <select
          name="intendedRole"
          defaultValue="ORG_MEMBER"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="ORG_MEMBER">Organization Member</option>
          <option value="ORG_ADMIN">Organization Administrator</option>
        </select>
      </label>
      <div className="sm:col-span-2 space-y-2">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
        >
          Invite member
        </button>
        {state ? (
          <p
            className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}
            role="status"
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
