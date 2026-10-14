"use client";

import { useState, type ReactNode } from "react";

import { Drawer } from "@/components/drawer";
import { ShellSidebar } from "@/components/shell-sidebar";
import { AppIcons } from "@/lib/design-system";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import type { BuildSidebarNavItem } from "@/lib/build-hub";
import type { ProjectedSidebarSection } from "@/lib/locations";
import type { NavRouteItem } from "@/lib/nav-zones";
import type { SidebarUnit } from "@/lib/units";

type ResponsiveShellNavProps = {
  navItems: readonly NavRouteItem[];
  buildNavItems: readonly BuildSidebarNavItem[];
  units?: SidebarUnit[];
  projectionSections?: readonly ProjectedSidebarSection[];
  projectionUnavailable?: boolean;
  lockedUnitId?: string;
  department?: ReactNode;
  modeNav?: ReactNode;
  compatibility?: ReactNode;
};

/**
 * Compact-width shell Menu. Desktop rails live in WorkspaceShellRail (xl+).
 * Locations is a workspace destination inside this Menu, not a second trigger.
 */
export function ResponsiveShellNav({
  navItems,
  buildNavItems,
  units,
  projectionSections,
  projectionUnavailable,
  lockedUnitId,
  department,
  modeNav,
  compatibility,
}: ResponsiveShellNavProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <div className="flex shrink-0 items-center xl:hidden" data-testid="compact-shell-nav">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          data-testid="shell-nav-run-menu"
          className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 ${FOCUS_RING_CLASS}`}
        >
          <AppIcons.menu className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          <span>Menu</span>
        </button>
      </div>

      <Drawer
        open={open}
        onClose={close}
        title="Menu"
        side="left"
        size="nav"
        data-testid="shell-run-nav-drawer"
      >
        <div className="flex flex-col gap-4">
          {department ? <div data-testid="compact-department-slot">{department}</div> : null}
          <ShellSidebar
            navItems={navItems}
            buildNavItems={buildNavItems}
            units={units}
            projectionSections={projectionSections}
            projectionUnavailable={projectionUnavailable}
            lockedUnitId={lockedUnitId}
            onNavigate={close}
          />
          {modeNav ? <div data-testid="compact-mode-nav">{modeNav}</div> : null}
          {compatibility ? (
            <div data-testid="compact-compatibility-switcher">{compatibility}</div>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}
