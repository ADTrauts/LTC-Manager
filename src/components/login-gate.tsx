"use client";

import { startTransition, useEffect, useState } from "react";

import { LoginForm } from "@/components/login-form";
import { PinLoginForm } from "@/components/pin-login-form";

type FacilityInfo = {
  id: string;
  displayName: string;
  managementCompanyName: string | null;
};

type UnitInfo = { id: string; name: string };

export function LoginGate() {
  const [loading, setLoading] = useState(true);
  const [facility, setFacility] = useState<FacilityInfo | null>(null);
  const [deviceUnit, setDeviceUnit] = useState<UnitInfo | null>(null);
  const [mode, setMode] = useState<"pin" | "email">("pin");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/auth/device-facility", { credentials: "include" });
      const data = (await res.json()) as { facility: FacilityInfo | null; unit: UnitInfo | null };
      if (cancelled) return;
      startTransition(() => {
        setFacility(data.facility);
        setDeviceUnit(data.unit);
        setMode(data.facility ? "pin" : "email");
        setLoading(false);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 text-sm text-zinc-600">
        Loading…
      </div>
    );
  }

  if (facility && mode === "pin") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-4">
        <PinLoginForm
          facilityName={facility.displayName}
          lockedUnitName={deviceUnit?.name}
          onUseEmail={() => setMode("email")}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-4">
      <LoginForm showPinHint={Boolean(facility)} onSwitchToPin={facility ? () => setMode("pin") : undefined} />
      {!facility ? (
        <p className="max-w-sm text-center text-xs text-zinc-500">
          PIN sign-in requires this browser to be bound to a facility. A General Manager can bind it from{" "}
          <span className="font-medium text-zinc-700">Admin → Organization</span> after signing in with email, or use
          email sign-in here to get started.
        </p>
      ) : null}
    </div>
  );
}
