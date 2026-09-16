"use client";

import { BuildSidebar } from "@/components/build/build-sidebar";
import { LeftSidebar } from "@/components/left-sidebar";
import type { BuildSidebarNavItem } from "@/lib/build-hub";
import type { ProjectedSidebarSection } from "@/lib/locations";
import { resolveProductModeForPath } from "@/lib/product-mode";
import type { ReadinessState } from "@/lib/readiness";
import type { SidebarUnit } from "@/lib/units";
import { useNavPathname } from "@/hooks/use-nav-pathname";

type ShellSidebarProps = {
  units?: SidebarUnit[];
  projectionSections?: readonly ProjectedSidebarSection[];
  projectionUnavailable?: boolean;
  lockedUnitId?: string;
  readinessByUnitId?: Record<string, { state: ReadinessState }>;
  /** Role/department-filtered BUILD nav items (includes Build Home when reachable). */
  buildNavItems: readonly BuildSidebarNavItem[];
};

/**
 * Mode-aware left rail:
 * - RUN → Locations hierarchy
 * - BUILD → Build tools
 * - ADMIN → no Locations rail (governance uses Admin page chrome; Locations was mode bleed)
 */
export function ShellSidebar({
  units,
  projectionSections,
  projectionUnavailable,
  lockedUnitId,
  readinessByUnitId,
  buildNavItems,
}: ShellSidebarProps) {
  const pathname = useNavPathname();
  const mode = resolveProductModeForPath(pathname ?? "/");

  if (mode === "BUILD") {
    return <BuildSidebar items={buildNavItems} />;
  }

  if (mode === "ADMIN") {
    return null;
  }

  return (
    <LeftSidebar
      units={units}
      projectionSections={projectionSections}
      projectionUnavailable={projectionUnavailable}
      lockedUnitId={lockedUnitId}
      readinessByUnitId={readinessByUnitId}
    />
  );
}
