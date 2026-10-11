"use client";

import { useActionState } from "react";

import { updateOwnDisplayNameAction } from "@/app/account/actions";
import { initialUpdateProfileState } from "@/app/account/profile-state";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

export function ProfileForm({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateOwnDisplayNameAction,
    initialUpdateProfileState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="account-display-name" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Display name
        </label>
        <input
          id="account-display-name"
          name="displayName"
          type="text"
          required
          minLength={1}
          maxLength={120}
          defaultValue={displayName}
          autoComplete="name"
          className={`mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm ${FOCUS_RING_CLASS}`}
          data-testid="account-display-name-input"
        />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Email</p>
        <p className="mt-1 text-sm text-zinc-900" data-testid="account-email">
          {email}
        </p>
        <p className="mt-1 text-sm text-zinc-600">Email changes are not currently available.</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="account-profile-save"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state.message ? (
          <p
            className={state.status === "error" ? "text-sm text-rose-700" : "text-sm text-emerald-700"}
            role={state.status === "error" ? "alert" : "status"}
            data-testid="account-profile-status"
          >
            {state.message}
          </p>
        ) : null}
      </div>
      {state.workspaceLost ? (
        <p className="text-sm text-zinc-700" role="status" data-testid="account-workspace-lost">
          That workspace is no longer available.
        </p>
      ) : null}
    </form>
  );
}
