"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type UnitOption = { id: string; name: string };

type DeviceFacilityResponse = {
  facility: { id: string; displayName: string } | null;
  unit: { id: string; name: string } | null;
};

export function BindDeviceForm({ units }: { units: UnitOption[] }) {
  const router = useRouter();
  const [loadingState, setLoadingState] = useState(true);
  const [unitId, setUnitId] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/auth/device-facility", { credentials: "include" });
      const data = (await res.json()) as DeviceFacilityResponse;
      if (cancelled) return;
      setUnitId(data.unit?.id ?? "");
      setLoadingState(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function apply() {
    setPending(true);
    setMsg(null);
    const res = await fetch("/api/auth/bind-device", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitId: unitId || null }),
    });
    setPending(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(data.error ?? "Could not update device binding.");
      return;
    }
    setMsg(
      unitId
        ? "This browser is bound to the facility and locked to the selected unit for PIN sign-in."
        : "This browser is bound to the facility for PIN sign-in (no unit lock).",
    );
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-sm font-medium text-zinc-900">Facility tablet / shared device</p>
      <p className="mt-1 text-sm text-zinc-600">
        Bind this browser so staff see the PIN screen on the login page. Optionally lock the tablet to one unit so every
        sign-in opens that location (staff not assigned there can still sign in; they get a warning and the event is
        logged).
      </p>
      <div className="mt-3">
        <label htmlFor="bind-device-unit" className="text-xs font-medium text-zinc-700">
          Unit lock (optional)
        </label>
        <select
          id="bind-device-unit"
          className="mt-1 block w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60"
          value={unitId}
          disabled={loadingState || pending}
          onChange={(e) => setUnitId(e.target.value)}
        >
          <option value="">Entire facility — no unit lock</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => void apply()}
        disabled={pending || loadingState}
        className="app-accent-button mt-3 rounded-md px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {pending ? "Saving…" : loadingState ? "Loading…" : "Apply device binding"}
      </button>
      {msg ? <p className="mt-2 text-sm text-zinc-700">{msg}</p> : null}
    </div>
  );
}
