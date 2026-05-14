"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { SidebarUnit } from "@/lib/units";

type LeftSidebarProps = {
  units: SidebarUnit[];
  lockedUnitId?: string;
};

function sidebarLinkClass(isActive: boolean, disabled = false) {
  if (disabled) {
    return "block cursor-not-allowed rounded-md px-3 py-2 text-sm text-zinc-400";
  }
  return isActive
    ? "app-accent-active block rounded-md px-3 py-2 text-sm font-medium text-white"
    : "block rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900";
}

export function LeftSidebar({ units, lockedUnitId }: LeftSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="app-accent-divider w-full shrink-0 border-r bg-white lg:min-h-0 lg:w-72 lg:overflow-y-auto">
      <div className="p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Locations
        </h2>
        <div className="space-y-1">
          <Link href="/dashboard" className={sidebarLinkClass(pathname === "/dashboard")}>
            Dashboard
          </Link>
          {units.map((unit) => {
            const href = `/unit/${unit.id}`;
            const isDisabled = Boolean(lockedUnitId && unit.id !== lockedUnitId);
            return (
              isDisabled ? (
                <span
                  key={unit.id}
                  aria-disabled="true"
                  className={sidebarLinkClass(false, true)}
                  title="This tablet is locked to another unit"
                >
                  {unit.name}
                </span>
              ) : (
                <Link
                  key={unit.id}
                  href={href}
                  className={sidebarLinkClass(pathname.startsWith(href))}
                >
                  {unit.name}
                </Link>
              )
            );
          })}
        </div>
      </div>
    </aside>
  );
}
