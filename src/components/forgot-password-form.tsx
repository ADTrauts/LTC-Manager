"use client";

import { useState } from "react";
import Link from "next/link";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: String(formData.get("email") ?? "") }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setLoading(false);
      setError(payload.error ?? "Could not start password reset.");
      return;
    }
    setLoading(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Check your email</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          If an account exists for that address, we sent a reset link. It expires in one hour.
        </p>
        <Link
          href="/login"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-teal-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
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
      <h1 className="text-xl font-semibold text-[var(--foreground)]">Reset password</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        Enter the email for your Vssyl account and we&apos;ll send a reset link.
      </p>
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-[var(--text-secondary)]">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
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
        {loading ? "Sending…" : "Send reset link"}
      </button>
      <Link href="/login" className="block text-center text-sm font-medium text-[var(--brand-accent)] underline">
        Back to sign in
      </Link>
    </form>
  );
}
