"use client";

import Link from "next/link";
import { useState } from "react";

import { BuildSidebar } from "@/components/build/build-sidebar";
import { Drawer } from "@/components/drawer";
import { LeftSidebar } from "@/components/left-sidebar";
import { useNavPathname } from "@/hooks/use-nav-pathname";
import type { BuildSidebarNavItem } from "@/lib/build-hub";
import { AppIcons, resolveNavIcon } from "@/lib/design-system";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import type { ProjectedSidebarSection } from "@/lib/locations";
import type { NavRouteItem } from "@/lib/nav-zones";
import { isActiveNavPath } from "@/lib/nav-utils";
import {
  groupNavItemsByMode,
  headerNavItemsForMode,
  resolveProductModeForPath,
} from "@/lib/product-mode";
import type { ReadinessState } from "@/lib/readiness";
import type { SidebarUnit } from "@/lib/units";

type CompactDrawer = "run" | "locations" | "build" | null;

type ResponsiveShellNavProps = {
  navItems: NavRouteItem[];
  buildNavItems: readonly BuildSidebarNavItem[];
  units?: SidebarUnit[];
  projectionSections?: readonly ProjectedSidebarSection[];
  projectionUnavailable?: boolean;
  lockedUnitId?: string;
  readinessByUnitId?: Record<string, { state: ReadinessState }>;
};

function ShellNavTrigger({
  label,
  ariaLabel,
  icon: Icon,
  onClick,
  testId,
}: {
  label: string;
  ariaLabel: string;
  icon: (typeof AppIcons)[keyof typeof AppIcons];
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId}
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 ${FOCUS_RING_CLASS}`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
      <span className="max-w-[5.5rem] truncate sm:max-w-none">{label}</span>
    </button>
  );
}

/**
 * Compact-width shell navigation triggers + drawers.
 * Desktop rails remain in ShellSidebar (xl+ / ≥1280px). Below that, drawers own navigation.
 *
 * RUN: Menu (modules) + Locations (tree) — two clear triggers, one shared Drawer primitive.
 * BUILD: Build menu (tools).
 */
export function ResponsiveShellNav({
  navItems,
  buildNavItems,
  units,
  projectionSections,
  projectionUnavailable,
  lockedUnitId,
  readinessByUnitId,
}: ResponsiveShellNavProps) {
  const pathname = useNavPathname() ?? "/";
  const mode = resolveProductModeForPath(pathname);
  const [drawer, setDrawer] = useState<CompactDrawer>(null);

  const runGroup = groupNavItemsByMode(navItems).find((g) => g.mode === "RUN");
  const runItems = headerNavItemsForMode("RUN", runGroup?.items ?? []);

  const close = () => setDrawer(null);

  const primaryLinks: { label: string; href: string }[] =
    mode === "ADMIN" ? [{ label: "Administration", href: "/admin" }] : runItems;

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5 xl:hidden" data-testid="compact-shell-nav">
        {mode === "RUN" ? (
          <>
            <ShellNavTrigger
              label="Menu"
              ariaLabel="Open Run navigation"
              icon={AppIcons.menu}
              onClick={() => setDrawer("run")}
              testId="shell-nav-run-menu"
            />
            <ShellNavTrigger
              label="Locations"
              ariaLabel="Open Locations"
              icon={AppIcons.locations}
              onClick={() => setDrawer("locations")}
              testId="shell-nav-locations"
            />
          </>
        ) : null}
        {mode === "BUILD" ? (
          <ShellNavTrigger
            label="Build"
            ariaLabel="Open Build navigation"
            icon={AppIcons.operationalMode}
            onClick={() => setDrawer("build")}
            testId="shell-nav-build-menu"
          />
        ) : null}
        {mode === "ADMIN" ? (
          <ShellNavTrigger
            label="Menu"
            ariaLabel="Open navigation"
            icon={AppIcons.menu}
            onClick={() => setDrawer("run")}
            testId="shell-nav-admin-menu"
          />
        ) : null}
      </div>

      <Drawer
        open={drawer === "run"}
        onClose={close}
        title={mode === "ADMIN" ? "Navigation" : "Run"}
        side="left"
        size="nav"
        data-testid="shell-run-nav-drawer"
      >
        <nav className="space-y-0.5" aria-label="Primary navigation">
          {primaryLinks.map((item) => {
            const isActive = isActiveNavPath(pathname, item.href);
            const Icon = resolveNavIcon(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className={
                  isActive
                    ? "flex min-h-11 items-center gap-2.5 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
                    : "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                }
                aria-current={isActive ? "page" : undefined}
              >
                {Icon ? (
                  <Icon
                    className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-zinc-500"}`}
                    aria-hidden
                  />
                ) : null}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </Drawer>

      <Drawer
        open={drawer === "locations"}
        onClose={close}
        title="Locations"
        side="left"
        size="nav"
        data-testid="shell-locations-drawer"
      >
        <LeftSidebar
          presentation="panel"
          onNavigate={close}
          units={units}
          projectionSections={projectionSections}
          projectionUnavailable={projectionUnavailable}
          lockedUnitId={lockedUnitId}
          readinessByUnitId={readinessByUnitId}
        />
      </Drawer>

      <Drawer
        open={drawer === "build"}
        onClose={close}
        title="Build"
        side="left"
        size="nav"
        panelClassName="bg-orange-50/50"
        data-testid="shell-build-nav-drawer"
      >
        <BuildSidebar presentation="panel" items={buildNavItems} onNavigate={close} />
      </Drawer>
    </>
  );
}
