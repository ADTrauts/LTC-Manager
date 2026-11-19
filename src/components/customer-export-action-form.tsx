"use client";
import { useActionState, type ReactNode } from "react";
import type { ExportFormState } from "@/app/(protected)/admin/exports/actions";
export function CustomerExportActionForm({ action, children }: {
    action: (previous: ExportFormState, form: FormData) => Promise<ExportFormState>;
    children: ReactNode;
}) {
    const [state, submit, pending] = useActionState(action, null);
    return <form action={submit} className="space-y-3"><fieldset disabled={pending} className="space-y-3">{children}</fieldset>{pending ? <p role="status">Saving…</p> : null}{state ? <p role={state.ok ? "status" : "alert"}>{state.message}</p> : null}</form>;
}
