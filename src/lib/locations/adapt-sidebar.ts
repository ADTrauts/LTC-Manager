/**
 * Wave 15G — Sidebar adapter.
 *
 * Shared LocationsViewModel → ProjectedSidebarNode presentation DTO.
 * Does not recompute eligibility, Plant policy, or department filters.
 */

import type { FacilityVocabulary } from "@/lib/facility-builder/facility-vocabulary";
import { DEFAULT_FACILITY_VOCABULARY } from "@/lib/facility-builder/facility-vocabulary";

import type { LocationsTreeNode, LocationsViewModel } from "./types";
import type {
  ProjectedSidebarNode,
  ProjectedSidebarSection,
  SidebarProjectionView,
} from "./sidebar-types";

function levelLabelFor(
  kind: LocationsTreeNode["kind"],
  vocabulary: FacilityVocabulary,
): string | null {
  switch (kind) {
    case "FLOOR":
      return vocabulary.level1.singular;
    case "NEIGHBORHOOD":
      return vocabulary.level2.singular;
    case "ROOM":
      return vocabulary.level3.singular;
    case "LEGACY":
      return null;
    case "FACILITY":
      return null;
    default:
      return null;
  }
}

function adaptTreeNode(
  node: LocationsTreeNode,
  vocabulary: FacilityVocabulary,
): ProjectedSidebarNode | null {
  // Facility root is chrome context; render its children at the section top.
  if (node.kind === "FACILITY") {
    return null;
  }

  const children = node.children
    .map((child) => adaptTreeNode(child, vocabulary))
    .filter((child): child is ProjectedSidebarNode => child != null);

  const unitId =
    node.kind === "ROOM"
      ? node.unitId
      : node.kind === "FLOOR" ||
          node.kind === "NEIGHBORHOOD" ||
          node.kind === "LEGACY"
        ? node.physicalId
        : null;

  const href =
    node.presentation === "ACTIONABLE" && unitId
      ? `/unit/${unitId}`
      : null;

  return {
    id: node.id,
    label: node.label,
    levelLabel: levelLabelFor(node.kind, vocabulary),
    presentation: node.presentation,
    kind: node.kind,
    unitId,
    href,
    children,
  };
}

function rootsToSidebarNodes(
  roots: readonly LocationsTreeNode[],
  vocabulary: FacilityVocabulary,
): ProjectedSidebarNode[] {
  const nodes: ProjectedSidebarNode[] = [];
  for (const root of roots) {
    if (root.kind === "FACILITY") {
      for (const child of root.children) {
        const adapted = adaptTreeNode(child, vocabulary);
        if (adapted) nodes.push(adapted);
      }
    } else {
      const adapted = adaptTreeNode(root, vocabulary);
      if (adapted) nodes.push(adapted);
    }
  }
  return nodes;
}

/**
 * Adapt the shared Locations view model into Sidebar presentation sections.
 * Facility Overview keeps labeled department sections — never merges Experiences.
 */
export function adaptLocationsViewToSidebar(
  view: LocationsViewModel,
  vocabulary: FacilityVocabulary = DEFAULT_FACILITY_VOCABULARY,
  error: string | null = null,
): SidebarProjectionView {
  const sections: ProjectedSidebarSection[] = view.departmentSnapshots.map(
    (dept) => ({
      departmentKey: dept.departmentKey,
      label: view.lensMode === "FACILITY" ? dept.label : null,
      nodes: rootsToSidebarNodes(dept.roots, vocabulary),
    }),
  );

  return {
    facilityId: view.facilityId,
    lensMode: view.lensMode,
    lensKey: view.lensKey,
    sections,
    projectedUnitIds: view.projectedUnitIds,
    error,
  };
}

/** Collect Unit ids that may receive readiness overlays. */
export function sidebarProjectedUnitIds(
  view: SidebarProjectionView,
): readonly string[] {
  return view.projectedUnitIds;
}
