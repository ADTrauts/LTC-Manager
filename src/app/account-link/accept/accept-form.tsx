"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function AcceptEmployeeLinkForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/auth/employee-link/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string; code?: string }
      | null;
    if (response.ok) {
      setMessage("This employee record is now connected to your account.");
    } else if (body?.code === "AUTH_REQUIRED") {
      setMessage("Sign in with the invited email, then return to this link.");
    } else {
      setMessage(body?.error ?? "This invitation could not be accepted.");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-16">
      <h1 className="text-xl font-semibold text-zinc-900">Connect workforce record</h1>
      <p className="text-sm text-zinc-600">
        This connects an existing Vssyl account to a Facility employee record. It does not create a
        second account.
      </p>
      <button
        type="button"
        disabled={busy || !token}
        onClick={() => void accept()}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Connecting…" : "Accept connection"}
      </button>
      {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
    </main>
  );
}
