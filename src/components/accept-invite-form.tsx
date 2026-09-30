"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/account-invite/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        password: String(formData.get("password") ?? ""),
        confirmPassword: String(formData.get("confirmPassword") ?? ""),
      }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setLoading(false);
      setError(payload.error ?? "Could not accept this invite.");
      return;
    }
    const payload = (await res.json()) as { nextPath?: string };
    router.replace(payload.nextPath ?? "/dashboard");
    router.refresh();
  }

  if (!token) {
    return (
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Invite link invalid</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          This invite is missing a token. Ask your manager to send a new invite.
        </p>
        <Link href="/login" className="block text-center text-sm font-medium text-[var(--brand-accent)] underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      action={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold text-[var(--foreground)]">Set your password</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        Choose a password to finish joining your facility on Vssyl.
      </p>
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-[var(--text-secondary)]">
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
          className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm outline-none ring-[var(--brand-accent)] focus:ring-2"
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-[var(--text-secondary)]"
        >
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
          className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm outline-none ring-[var(--brand-accent)] focus:ring-2"
        />
      </div>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-teal-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Saving…" : "Create password and continue"}
      </button>
      <Link href="/login" className="block text-center text-sm font-medium text-[var(--brand-accent)] underline">
        Back to sign in
      </Link>
    </form>
  );
}
