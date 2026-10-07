"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function OrganizationClaimAcceptForm({
  token,
  targetEmail,
  organizationName,
  mode,
  contactName,
}: {
  token: string;
  targetEmail: string;
  organizationName: string;
  mode: "new_user" | "existing_authenticated" | "existing_login_required" | "email_mismatch";
  contactName: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (mode === "email_mismatch") {
    return (
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Invitation belongs to another email</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          This claim is for <span className="font-medium">{targetEmail}</span>. Sign out and continue
          with that account.
        </p>
        <Link href="/login" className="block text-center text-sm font-medium underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (mode === "existing_login_required") {
    return (
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Sign in to accept</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          An account already exists for <span className="font-medium">{targetEmail}</span>. Sign in,
          then return to this claim link to become Organization Administrator for{" "}
          {organizationName}.
        </p>
        <Link
          href="/login"
          className="block rounded-lg bg-teal-700 px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-teal-800"
        >
          Sign in
        </Link>
      </div>
    );
  }

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/organization-claim/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        password: String(formData.get("password") ?? "") || undefined,
        confirmPassword: String(formData.get("confirmPassword") ?? "") || undefined,
        displayName: String(formData.get("displayName") ?? "") || undefined,
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      nextPath?: string;
    };
    if (!res.ok) {
      setLoading(false);
      setError(payload.error ?? "Could not accept this claim.");
      return;
    }
    router.replace(payload.nextPath ?? "/organization");
    router.refresh();
  }

  return (
    <form
      action={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm"
      data-testid="organization-claim-accept-form"
    >
      <h1 className="text-xl font-semibold">Claim {organizationName}</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        Accepting makes you the Organization Administrator. This does not grant access to any
        customer Facility.
      </p>
      <p className="text-sm text-[var(--text-secondary)]">
        Invitation email: <span className="font-medium">{targetEmail}</span>
      </p>

      {mode === "new_user" ? (
        <>
          <div className="space-y-2">
            <label htmlFor="displayName" className="block text-sm font-medium">
              Display name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              required
              defaultValue={contactName ?? ""}
              minLength={1}
              maxLength={120}
              className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm font-medium">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm"
            />
          </div>
        </>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-teal-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
      >
        {loading
          ? "Accepting…"
          : mode === "new_user"
            ? "Create account and accept"
            : "Accept Organization Administrator role"}
      </button>
    </form>
  );
}
