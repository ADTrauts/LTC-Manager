"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AppIcons } from "@/lib/design-system";

type FacilityOption = {
  facilityId: string;
  facilityName: string;
};

type Props = {
  facilities: FacilityOption[];
  activeFacilityId: string;
};

const HINT = "Switches your active facility. Operational data reloads for the selected site.";

/**
 * Email leadership only. Hidden when fewer than two accessible facilities.
 * PIN/kiosk shells must not render this component.
 */
export function FacilitySwitcher({ facilities, activeFacilityId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const BuildingIcon = AppIcons.facility;

  if (facilities.length < 2) {
    return null;
  }

  async function commit(facilityId: string) {
    if (!facilityId || facilityId === activeFacilityId) return;
    setError(null);
    const res = await fetch("/api/auth/switch-facility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facilityId }),
    });
    const json = (await res.json().catch(() => null)) as {
      error?: string;
      redirectPath?: string;
    } | null;
    if (!res.ok) {
      setError(json?.error ?? "Could not switch facility.");
      return;
    }
    startTransition(() => {
      router.replace(json?.redirectPath ?? "/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="flex w-[9.5rem] shrink-0 flex-col justify-center gap-0.5 sm:w-[11rem] lg:w-[13rem]">
      <label
        className="sr-only lg:not-sr-only lg:text-[10px] lg:font-semibold lg:uppercase lg:tracking-[0.12em] lg:text-zinc-500"
        htmlFor="active-facility"
      >
        Facility
      </label>
      <div
        className="flex min-h-10 items-stretch overflow-hidden rounded-md border border-zinc-300 bg-white shadow-sm focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-200"
        title={HINT}
      >
        <span
          className="flex shrink-0 items-center border-r border-zinc-200 bg-zinc-50 px-1.5 text-zinc-500 sm:px-2"
          aria-hidden
        >
          {BuildingIcon ? <BuildingIcon className="h-4 w-4" /> : null}
        </span>
        <select
          id="active-facility"
          data-testid="facility-switcher"
          className="min-h-10 w-full min-w-0 border-0 bg-transparent px-1.5 py-1.5 text-sm text-zinc-800 focus:outline-none disabled:opacity-60 sm:px-2"
          disabled={pending}
          value={activeFacilityId}
          onChange={(e) => void commit(e.target.value)}
          aria-describedby="active-facility-hint"
          title={HINT}
        >
          {facilities.map((facility) => (
            <option key={facility.facilityId} value={facility.facilityId}>
              {facility.facilityName}
              {facility.facilityId === activeFacilityId ? " (current)" : ""}
            </option>
          ))}
        </select>
      </div>
      <span id="active-facility-hint" className="sr-only">
        {HINT}
      </span>
      {error ? <p className="text-[11px] text-red-700">{error}</p> : null}
    </div>
  );
}
