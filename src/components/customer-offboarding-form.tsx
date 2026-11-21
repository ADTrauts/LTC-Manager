"use client";

import { useActionState, type ReactNode } from "react";
import type { OffboardingFormState } from "@/lib/customer-offboarding/contract";

export function CustomerOffboardingForm({ action, children }: {
  action: (previous: OffboardingFormState, form: FormData) => Promise<OffboardingFormState>;
  children: ReactNode;
}) {
  const [state, submit, pending] = useActionState(action, null);
  return <form action={submit} className="space-y-3">
    <fieldset disabled={pending} className="space-y-3">{children}</fieldset>
    {pending ? <p role="status">Saving…</p> : null}
    {state ? <p role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
  </form>;
}
