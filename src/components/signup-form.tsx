"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type SignupState = {
  error: string | null;
  loading: boolean;
};

export function SignupForm() {
  const router = useRouter();
  const [state, setState] = useState<SignupState>({ error: null, loading: false });

  async function onSubmit(formData: FormData) {
    setState({ loading: true, error: null });

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        facilityName: String(formData.get("facilityName") ?? ""),
        managementCompanyName: String(formData.get("managementCompanyName") ?? ""),
        adminName: String(formData.get("adminName") ?? ""),
        adminEmail: String(formData.get("adminEmail") ?? ""),
        password: String(formData.get("password") ?? ""),
      }),
      headers: { "content-type": "application/json" },
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setState({ loading: false, error: payload.error ?? "Unable to create account." });
      return;
    }

    const payload = (await res.json()) as { nextPath?: string };
    router.push(payload.nextPath ?? "/setup");
    router.refresh();
  }

  return (
    <form action={onSubmit} className="w-full max-w-xl space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Create your LTC Manager account</h1>
        <p className="mt-1 text-sm text-zinc-600">Set up your facility and start onboarding in a few minutes.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Facility Name</span>
          <input name="facilityName" required minLength={2} maxLength={200} className="app-input w-full" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Managing Partner (optional)</span>
          <input name="managementCompanyName" maxLength={200} className="app-input w-full" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Your Name (Admin)</span>
          <input name="adminName" required minLength={2} maxLength={120} className="app-input w-full" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Admin Email</span>
          <input name="adminEmail" type="email" autoComplete="email" required className="app-input w-full" />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-zinc-700">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          className="app-input w-full"
        />
      </label>

      {state.error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p> : null}

      <button
        type="submit"
        disabled={state.loading}
        className="app-button app-accent-button w-full font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
      >
        {state.loading ? "Creating account..." : "Create account and start setup"}
      </button>

      <p className="text-sm text-zinc-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-zinc-900 underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
