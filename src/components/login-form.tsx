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
};

export function LoginForm({ showPinHint, onSwitchToPin }: LoginFormProps = {}) {
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
      className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold text-zinc-900">Sign in</h1>
      <p className="text-sm text-zinc-600">
        Sign in with your organization account to access operational modules.
      </p>
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-900 focus:ring-2"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-900 focus:ring-2"
        />
      </div>
      {state.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={state.loading}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {state.loading ? "Signing in..." : "Sign in"}
      </button>
      <p className="text-xs text-zinc-500">
        Seeded admin for development: <code>admin@terraceview.local</code>
      </p>
      <p className="text-sm text-zinc-600">
        New here?{" "}
        <Link href="/signup" className="font-medium text-zinc-900 underline">
          Create your account
        </Link>
      </p>
      {showPinHint && onSwitchToPin ? (
        <button
          type="button"
          onClick={onSwitchToPin}
          className="w-full text-center text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          Use 6-digit PIN instead
        </button>
      ) : null}
    </form>
  );
}
