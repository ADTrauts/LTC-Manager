"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { resolveDefaultHomePath } from "@/lib/nav-zones";

type PinLoginFormProps = {
  facilityName: string;
  /** When the device is unit-locked (kiosk), shown under the facility name. */
  lockedUnitName?: string;
  onUseEmail: () => void;
};

export function PinLoginForm({ facilityName, lockedUnitName, onUseEmail }: PinLoginFormProps) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function append(d: string) {
    if (pin.length >= 6) return;
    setPin((p) => (p + d).slice(0, 6));
    setError(null);
  }

  function backspace() {
    setPin((p) => p.slice(0, -1));
  }

  async function submit() {
    if (pin.length !== 6) {
      setError("Enter all 6 digits.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/pin-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pin }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
    if (!res.ok) {
      setError(data.error ?? "Sign-in failed.");
      setLoading(false);
      return;
    }
    const path =
      typeof data.redirectTo === "string" && data.redirectTo.startsWith("/")
        ? data.redirectTo
        : resolveDefaultHomePath({ authKind: "employee", role: "STAFF" });
    router.push(path);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">LTC Manager</p>
        <h1 className="mt-1 text-lg font-semibold text-zinc-900">{facilityName}</h1>
        {lockedUnitName ? (
          <p className="mt-1 text-sm font-medium text-zinc-800">Unit: {lockedUnitName}</p>
        ) : null}
        <p className="mt-1 text-sm text-zinc-600">Enter your 6-digit PIN</p>
      </div>
      <div
        className="rounded-md border border-zinc-300 bg-zinc-50 py-3 text-center font-mono text-2xl tracking-[0.4em] text-zinc-900"
        aria-live="polite"
      >
        {pin.padEnd(6, "·")}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => append(d)}
            disabled={loading}
            className="rounded-lg border border-zinc-300 py-3 text-lg font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={backspace}
          disabled={loading}
          className="rounded-lg border border-zinc-300 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => append("0")}
          disabled={loading}
          className="rounded-lg border border-zinc-300 py-3 text-lg font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50"
        >
          0
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={loading || pin.length !== 6}
          className="rounded-lg bg-zinc-900 py-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {loading ? "…" : "Go"}
        </button>
      </div>
      {error ? <p className="text-center text-sm text-red-700">{error}</p> : null}
      <button
        type="button"
        onClick={onUseEmail}
        className="w-full text-center text-sm text-zinc-600 underline hover:text-zinc-900"
      >
        Sign in with email instead
      </button>
    </div>
  );
}
