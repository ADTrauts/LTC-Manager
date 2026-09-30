"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        newPassword: String(formData.get("newPassword") ?? ""),
        confirmPassword: String(formData.get("confirmPassword") ?? ""),
      }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setLoading(false);
      setError(payload.error ?? "Could not update password.");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  if (!token) {
    return (
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Link missing</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          This reset link is incomplete. Request a new one from the sign-in page.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-teal-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form
      action={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold text-[var(--foreground)]">Choose a new password</h1>
      <p className="text-sm text-[var(--text-secondary)]">Use at least 8 characters.</p>
      <div className="space-y-2">
        <label htmlFor="newPassword" className="block text-sm font-medium text-[var(--text-secondary)]">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
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
          minLength={8}
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
        {loading ? "Updating…" : "Update password"}
      </button>
      <Link href="/login" className="block text-center text-sm font-medium text-[var(--brand-accent)] underline">
        Back to sign in
      </Link>
    </form>
  );
}
