"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type LoginState = {
  error: string | null;
  loading: boolean;
};

type LoginFormProps = {
  showPinHint?: boolean;
  onSwitchToPin?: () => void;
  signupEnabled?: boolean;
};

export function LoginForm({ showPinHint, onSwitchToPin, signupEnabled = false }: LoginFormProps = {}) {
  const router = useRouter();
  const [state, setState] = useState<LoginState>({ error: null, loading: false });

  async function onSubmit(formData: FormData) {
    setState({ loading: true, error: null });

    const res = await fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    if (!res.ok) {
      const payload = (await res.json()) as { error?: string };
      setState({ loading: false, error: payload.error ?? "Sign-in failed." });
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form
      action={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold text-[var(--foreground)]">Sign in</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        Email and password for managers. Staff can use PIN at a unit device.
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
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-[var(--text-secondary)]">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm outline-none ring-[var(--brand-accent)] focus:ring-2"
        />
      </div>
      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={state.loading}
        className="w-full rounded-lg bg-teal-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state.loading ? "Signing in..." : "Continue"}
      </button>
      {showPinHint && onSwitchToPin ? (
        <button
          type="button"
          onClick={onSwitchToPin}
          className="w-full rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--run-surface)]"
        >
          Use staff PIN instead
        </button>
      ) : null}
      {signupEnabled ? (
        <Link
          href="/signup"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--run-surface)]"
        >
          Start free setup
        </Link>
      ) : null}
      <p className="text-xs text-[var(--text-muted)]">
        Seeded admin for development: <code>admin@terraceview.local</code>
      </p>
    </form>
  );
}
