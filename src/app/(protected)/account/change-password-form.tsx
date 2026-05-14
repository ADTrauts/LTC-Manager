"use client";

import { useActionState } from "react";

import { changeOwnPasswordAction } from "@/app/(protected)/account/actions";
import { initialChangePasswordState } from "@/app/(protected)/account/change-password-state";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    changeOwnPasswordAction,
    initialChangePasswordState,
  );

  return (
    <form action={formAction} className="mt-4 grid max-w-xl grid-cols-1 gap-3">
      <input
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        minLength={8}
        maxLength={128}
        placeholder="Current password"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      <input
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        placeholder="New password"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      <input
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        placeholder="Confirm new password"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Updating..." : "Update password"}
        </button>
        {state.message ? (
          <p
            className={
              state.status === "success" ? "text-sm text-emerald-700" : "text-sm text-rose-700"
            }
            role={state.status === "error" ? "alert" : undefined}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
