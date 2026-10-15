"use client";

import { BuildSidebar } from "@/components/build/build-sidebar";
import { LocationsQuickAccess } from "@/components/shell/locations-quick-access";
import { WorkspaceOwnedNav } from "@/components/shell/workspace-owned-nav";
import { useNavPathname } from "@/hooks/use-nav-pathname";
import type { BuildSidebarNavItem } from "@/lib/build-hub";
import type { ProjectedSidebarSection } from "@/lib/locations";
import type { NavRouteItem } from "@/lib/nav-zones";
import {
  groupNavItemsByMode,
  headerNavItemsForMode,
  resolveProductModeForPath,
} from "@/lib/product-mode";
import type { SidebarUnit } from "@/lib/units";

type ShellSidebarProps = {
  navItems: readonly NavRouteItem[];
  buildNavItems: readonly BuildSidebarNavItem[];
  units?: SidebarUnit[];
  projectionSections?: readonly ProjectedSidebarSection[];
  projectionUnavailable?: boolean;
  lockedUnitId?: string;
  onNavigate?: () => void;
  compact?: boolean;
};

/**
 * Workspace-owned destinations for the Facility shell.
 * RUN list from the route registry. Locations hierarchy opens on demand.
 * BUILD uses BuildSidebar. ADMIN is a single governance destination.
 */
export function ShellSidebar({
  navItems,
  buildNavItems,
  units,
  projectionSections,
  projectionUnavailable,
  lockedUnitId,
  onNavigate,
  compact = false,
}: ShellSidebarProps) {
  const pathname = useNavPathname() ?? "/";
  const mode = resolveProductModeForPath(pathname);
  const groups = groupNavItemsByMode(navItems);
  const runGroup = groups.find((group) => group.mode === "RUN");
  const runItems = headerNavItemsForMode("RUN", runGroup?.items ?? []);

  if (mode === "BUILD") {
    return <BuildSidebar presentation="panel" items={buildNavItems} onNavigate={onNavigate} />;
  }

  if (mode === "ADMIN") {
    return (
      <WorkspaceOwnedNav
        items={[{ href: "/admin", label: "Administration" }]}
        label="Administration"
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <WorkspaceOwnedNav
      items={runItems}
      onNavigate={onNavigate}
      renderItem={(item, link) =>
        item.href === "/units" ? (
          <LocationsQuickAccess
            key={pathname}
            compact={compact}
            onNavigate={onNavigate}
            units={units}
            projectionSections={projectionSections}
            projectionUnavailable={projectionUnavailable}
            lockedUnitId={lockedUnitId}
          >
            {link}
          </LocationsQuickAccess>
        ) : link
      }
    />
  );
}
