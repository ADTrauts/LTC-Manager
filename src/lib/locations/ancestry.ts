/**
 * Shared projected location ancestry helpers.
 *
 * Sidebar and Locations must agree on physical keys, parent/child edges,
 * and actionability — never rebuild eligibility independently.
 */

import type { LocationsTreeNode, LocationsViewModel } from "./types";
import type { ProjectedSidebarNode, SidebarProjectionView } from "./sidebar-types";

export type ProjectedAncestryRecord = {
  id: string;
  parentId: string | null;
  physicalId: string;
  kind: LocationsTreeNode["kind"];
  presentation: LocationsTreeNode["presentation"];
  href: string | null;
};

function walkLocations(
  nodes: readonly LocationsTreeNode[],
  parentId: string | null,
  out: ProjectedAncestryRecord[],
) {
  for (const node of nodes) {
    // Facility chrome is not a navigation node — children inherit the outer parent.
    if (node.kind === "FACILITY") {
      walkLocations(node.children, parentId, out);
      continue;
    }
    out.push({
      id: node.id,
      parentId,
      physicalId: node.physicalId,
      kind: node.kind,
      presentation: node.presentation,
      href: node.href,
    });
    walkLocations(node.children, node.id, out);
  }
}

function walkSidebar(
  nodes: readonly ProjectedSidebarNode[],
  parentId: string | null,
  out: ProjectedAncestryRecord[],
) {
  for (const node of nodes) {
    out.push({
      id: node.id,
      parentId,
      physicalId: node.unitId ?? node.id,
      kind: node.kind,
      presentation: node.presentation,
      href: node.href,
    });
    walkSidebar(node.children, node.id, out);
  }
}

/** Flatten Locations tree into ancestry records (facility roots skipped as nodes). */
export function collectLocationsAncestry(
  view: LocationsViewModel,
): ProjectedAncestryRecord[] {
  const out: ProjectedAncestryRecord[] = [];
  for (const dept of view.departmentSnapshots) {
    walkLocations(dept.roots, null, out);
  }
  return out;
}

/** Flatten Sidebar tree into ancestry records. */
export function collectSidebarAncestry(
  view: SidebarProjectionView,
): ProjectedAncestryRecord[] {
  const out: ProjectedAncestryRecord[] = [];
  for (const section of view.sections) {
    walkSidebar(section.nodes, null, out);
  }
  return out;
}

export type AncestryParityReport = {
  identicalIds: boolean;
  identicalAncestry: boolean;
  identicalActionability: boolean;
  locationsIds: readonly string[];
  sidebarIds: readonly string[];
};

/**
 * Compare Locations and Sidebar trees derived from the same LocationsViewModel.
 */
export function compareLocationSidebarAncestry(
  locations: LocationsViewModel,
  sidebar: SidebarProjectionView,
): AncestryParityReport {
  const loc = collectLocationsAncestry(locations);
  const side = collectSidebarAncestry(sidebar);

  const locationsIds = [...loc.map((r) => r.id)].sort();
  const sidebarIds = [...side.map((r) => r.id)].sort();

  const locById = new Map(loc.map((r) => [r.id, r]));
  const sideById = new Map(side.map((r) => [r.id, r]));

  const identicalIds =
    locationsIds.length === sidebarIds.length &&
    locationsIds.every((id, i) => id === sidebarIds[i]);

  let identicalAncestry = identicalIds;
  let identicalActionability = identicalIds;

  if (identicalIds) {
    for (const id of locationsIds) {
      const a = locById.get(id)!;
      const b = sideById.get(id)!;
      if (a.parentId !== b.parentId) identicalAncestry = false;
      if (a.presentation !== b.presentation) identicalActionability = false;
      // href may differ only by encoding; both null or both non-null for actionability
      if ((a.href == null) !== (b.href == null)) identicalActionability = false;
    }
  }

  return {
    identicalIds,
    identicalAncestry,
    identicalActionability,
    locationsIds,
    sidebarIds,
  };
}
