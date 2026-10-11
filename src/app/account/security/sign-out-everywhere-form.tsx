"use client";

import { useTransition } from "react";

import { signOutEverywhereAction } from "@/app/account/security/actions";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

export function SignOutEverywhereForm() {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={() => {
        if (
          !window.confirm(
            "This signs your Vssyl User account out on every device, including this one. Continue?",
          )
        ) {
          return;
        }
        startTransition(() => {
          void signOutEverywhereAction();
        });
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING_CLASS}`}
        data-testid="account-sign-out-everywhere"
      >
        {pending ? "Signing out…" : "Sign out everywhere"}
      </button>
    </form>
  );
}
