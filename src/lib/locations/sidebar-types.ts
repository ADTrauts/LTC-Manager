/**
 * Wave 15G — Sidebar presentation types over the shared projected location tree.
 *
 * Eligibility lives in LocationsViewModel. Sidebar only adapts presentation.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type { ProjectionLocationPresentation } from "@/lib/projection";
import type { ReadinessState } from "@/lib/readiness";

export type ProjectedSidebarNode = {
  id: string;
  label: string;
  /** Room number or other secondary display when available. */
  secondaryLabel: string | null;
  /** Facility vocabulary level label (Floor / Neighborhood / Room / …). */
  levelLabel: string | null;
  presentation: ProjectionLocationPresentation;
  kind: "FACILITY" | "FLOOR" | "NEIGHBORHOOD" | "LEGACY" | "ROOM";
  /** Owning Unit id for lock checks and readiness attachment. */
  unitId: string | null;
  /**
   * Navigable only when Projection marks ACTIONABLE.
   * Rooms prefer `/unit/[unitId]?space=[spaceId]` (no dedicated room route).
   * STRUCTURAL nodes are orientation-only (href null).
   */
  href: string | null;
  children: readonly ProjectedSidebarNode[];
};

export type ProjectedSidebarSection = {
  /** Null for single-department lens; set for Facility Overview labels. */
  departmentKey: OperationalDepartmentKey | null;
  label: string | null;
  nodes: readonly ProjectedSidebarNode[];
};

export type SidebarProjectionView = {
  facilityId: string;
  lensMode: "DEPARTMENT" | "FACILITY";
  lensKey: string;
  sections: readonly ProjectedSidebarSection[];
  projectedUnitIds: readonly string[];
  error: string | null;
};

export type SidebarReadinessByUnitId = Record<string, { state: ReadinessState }>;
