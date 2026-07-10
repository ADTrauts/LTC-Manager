"use client";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { NAV_ZONE_LABELS, resolveZoneForPathname } from "@/lib/nav-zones";

export function ShellZoneIndicator() {
  const pathname = useNavPathname();
  if (!pathname) {
    return (
      <div
        className="shrink-0 border-b border-zinc-200 bg-white px-3 py-1 sm:px-4 lg:px-6"
        aria-hidden="true"
      >
        <div className="h-3 w-36 rounded bg-zinc-100" />
      </div>
    );
  }

  const zoneLabel = NAV_ZONE_LABELS[resolveZoneForPathname(pathname)];

  return (
    <div className="shrink-0 border-b border-zinc-200 bg-white px-3 py-1 sm:px-4 lg:px-6">
      <p className="text-xs leading-none text-zinc-600">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Zone</span>
        <span className="mx-1.5 text-zinc-300" aria-hidden="true">
          /
        </span>
        <span className="font-medium text-zinc-800">{zoneLabel}</span>
      </p>
    </div>
  );
}
