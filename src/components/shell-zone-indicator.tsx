"use client";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { NAV_ZONE_LABELS, resolveZoneForPathname } from "@/lib/nav-zones";

export function ShellZoneIndicator() {
  const pathname = useNavPathname();
  if (!pathname) {
    return (
      <div
        className="app-accent-divider shrink-0 border-b bg-zinc-50/90 px-4 py-2 lg:px-6"
        aria-hidden="true"
      >
        <div className="h-4 w-32 rounded bg-zinc-200/80" />
      </div>
    );
  }

  const zoneLabel = NAV_ZONE_LABELS[resolveZoneForPathname(pathname)];

  return (
    <div className="app-accent-divider shrink-0 border-b bg-zinc-50/90 px-4 py-2 lg:px-6">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Zone</p>
      <p className="text-sm font-medium text-zinc-800">{zoneLabel}</p>
    </div>
  );
}
