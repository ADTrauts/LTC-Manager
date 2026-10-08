"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function OrganizationMemberAcceptForm({
  token,
  targetEmail,
  organizationName,
  roleLabel,
  mode,
}: {
  token: string;
  targetEmail: string;
  organizationName: string;
  roleLabel: string;
  mode: "new_user" | "existing_authenticated" | "existing_login_required" | "email_mismatch";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (mode === "email_mismatch") {
    return (
      <p className="text-sm text-zinc-600">
        This invitation is for {targetEmail}. Sign out and continue with that account.
      </p>
    );
  }
  if (mode === "existing_login_required") {
    return (
      <p className="text-sm text-zinc-600">
        Sign in as {targetEmail}, then return to this link.{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    );
  }

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/organization-member-invitation/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        displayName: formData.get("displayName") || undefined,
        password: formData.get("password") || undefined,
        confirmPassword: formData.get("confirmPassword") || undefined,
      }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; nextPath?: string } | null;
    setLoading(false);
    if (!response.ok || !body?.nextPath) {
      setError(body?.error ?? "Could not accept invitation.");
      return;
    }
    router.push(body.nextPath);
    router.refresh();
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <p className="text-sm text-zinc-700">
        Join <span className="font-medium">{organizationName}</span> as {roleLabel}. This does not
        grant Facility access.
      </p>
      <p className="text-xs text-zinc-500">{targetEmail}</p>
      {mode === "new_user" ? (
        <>
          <input
            name="displayName"
            required
            placeholder="Your name"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            name="password"
            type="password"
            required
            minLength={10}
            placeholder="Password"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={10}
            placeholder="Confirm password"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
      >
        {loading ? "Accepting…" : "Accept invitation"}
      </button>
    </form>
  );
}
