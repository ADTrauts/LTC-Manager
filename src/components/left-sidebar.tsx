"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ReadinessChip } from "@/components/readiness-chip";
import { NAV_ZONE_LABELS } from "@/lib/nav-zones";
import { isActiveNavPath } from "@/lib/nav-utils";
import type { ReadinessState } from "@/lib/readiness";
import type { SidebarUnit } from "@/lib/units";

type LeftSidebarProps = {
  units: SidebarUnit[];
  lockedUnitId?: string;
  /** Supervisor+ user sessions see the Operations Center entry; floor PIN sessions do not. */
  showOperationsCenterLink?: boolean;
  readinessByUnitId?: Record<string, { state: ReadinessState }>;
};

function sidebarLinkClass(isActive: boolean, disabled = false) {
  if (disabled) {
    return "flex min-h-11 items-center rounded-md px-3 py-2 text-sm text-zinc-400";
  }
  return isActive
    ? "app-accent-active flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-white"
    : "flex min-h-11 items-center rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900";
}

export function LeftSidebar({
  units,
  lockedUnitId,
  showOperationsCenterLink = true,
  readinessByUnitId = {},
}: LeftSidebarProps) {
  const pathname = usePathname();
  const operationsCenterLabel = NAV_ZONE_LABELS.OPERATIONS_CENTER;

  return (
    <aside
      className="w-full shrink-0 border-r border-zinc-200 bg-white lg:min-h-0 lg:w-72 lg:overflow-y-auto"
      aria-label="Locations rail"
    >
      <div className="flex flex-col gap-6 p-4 lg:px-4 lg:py-5">
        {showOperationsCenterLink ? (
          <section aria-label={operationsCenterLabel}>
            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
              {operationsCenterLabel}
            </h2>
            <div className="space-y-0.5">
              <Link
                href="/dashboard"
                className={sidebarLinkClass(isActiveNavPath(pathname, "/dashboard"))}
              >
                {operationsCenterLabel}
              </Link>
            </div>
          </section>
        ) : null}

        <section aria-label="Service points">
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            {NAV_ZONE_LABELS.LOCATIONS}
          </h2>
          <div className="space-y-0.5">
            {units.map((unit) => {
              const href = `/unit/${unit.id}`;
              const isDisabled = Boolean(lockedUnitId && unit.id !== lockedUnitId);
              const readiness = readinessByUnitId[unit.id];
              const label = (
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate">{unit.name}</span>
                  {readiness ? <ReadinessChip state={readiness.state} className="shrink-0" /> : null}
                </span>
              );
              return isDisabled ? (
                <span
                  key={unit.id}
                  aria-disabled="true"
                  className={sidebarLinkClass(false, true)}
                  title="This tablet is locked to another unit"
                >
                  {label}
                </span>
              ) : (
                <Link
                  key={unit.id}
                  href={href}
                  className={sidebarLinkClass(isActiveNavPath(pathname, href))}
                >
                  {label}
                </Link>
              );
            })}
            {units.length === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-500">No active locations.</p>
            ) : null}
          </div>
        </section>
      </div>
    </aside>
  );
}
