"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function HarborLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/console/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setLoading(false);
      setError(payload.error ?? "Sign-in failed.");
      return;
    }
    router.push("/console");
    router.refresh();
  }

  return (
    <form
      action={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-white p-6"
    >
      <h1 className="text-xl font-semibold text-[var(--foreground)]">Staff sign in</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        Harbor Console is for LTC Corp staff. Facility accounts use the main sign-in page.
      </p>
      <div className="space-y-2">
        <label htmlFor="harbor-email" className="block text-sm font-medium text-[var(--text-secondary)]">
          Email
        </label>
        <input
          id="harbor-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm outline-none ring-[var(--brand-accent)] focus:ring-2"
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor="harbor-password"
          className="block text-sm font-medium text-[var(--text-secondary)]"
        >
          Password
        </label>
        <input
          id="harbor-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm outline-none ring-[var(--brand-accent)] focus:ring-2"
        />
      </div>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)] disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
