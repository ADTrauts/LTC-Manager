"use client";

import { startTransition, useEffect, useState } from "react";

import { HarborAuthFrame, HarborAsidePrimaryLink, HARBOR_PRODUCT_POINTS } from "@/components/harbor-auth-frame";
import { LoginForm } from "@/components/login-form";
import { PinLoginForm } from "@/components/pin-login-form";

type FacilityInfo = {
  id: string;
  displayName: string;
  managementCompanyName: string | null;
};

type UnitInfo = { id: string; name: string };

type LoginGateProps = {
  signupEnabled?: boolean;
};

export function LoginGate({ signupEnabled = false }: LoginGateProps) {
  const [facility, setFacility] = useState<FacilityInfo | null>(null);
  const [deviceUnit, setDeviceUnit] = useState<UnitInfo | null>(null);
  const [mode, setMode] = useState<"pin" | "email">("email");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    void (async () => {
      try {
        const res = await fetch("/api/auth/device-facility", {
          credentials: "include",
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => null)) as
          | { facility: FacilityInfo | null; unit: UnitInfo | null }
          | null;
        if (cancelled) return;
        startTransition(() => {
          const nextFacility = res.ok ? (data?.facility ?? null) : null;
          setFacility(nextFacility);
          setDeviceUnit(res.ok ? (data?.unit ?? null) : null);
          setMode(nextFacility ? "pin" : "email");
        });
      } catch {
        if (cancelled) return;
        startTransition(() => {
          setFacility(null);
          setDeviceUnit(null);
          setMode("email");
        });
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <HarborAuthFrame
      title="Facility operations, without the noise."
      description="Sign in to run today's work, locations, staffing, and follow-ups from one calm workspace."
      points={HARBOR_PRODUCT_POINTS}
      actions={
        signupEnabled ? <HarborAsidePrimaryLink href="/signup">Start free setup</HarborAsidePrimaryLink> : null
      }
    >
      {facility && mode === "pin" ? (
        <PinLoginForm
          facilityName={facility.displayName}
          lockedUnitName={deviceUnit?.name}
          onUseEmail={() => setMode("email")}
        />
      ) : (
        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          <LoginForm
            showPinHint={Boolean(facility)}
            onSwitchToPin={facility ? () => setMode("pin") : undefined}
            signupEnabled={signupEnabled}
          />
          {!facility ? (
            <p className="max-w-sm text-center text-xs text-[var(--text-muted)]">
              PIN sign-in requires this browser to be bound to a facility. A General Manager can bind it from{" "}
              <span className="font-medium text-[var(--foreground)]">Admin → Organization</span> after signing in with
              email, or use email sign-in here to get started.
            </p>
          ) : null}
        </div>
      )}
    </HarborAuthFrame>
  );
}
