/**
 * Collect visible ACTIONABLE SPACE refs from the Projection Locations tree.
 * Pure walk. Does not query or resolve operational truth.
 */

import type { LocationsTreeNode, LocationsViewModel } from "@/lib/locations/types";
import type { RuntimeLocationSpaceRef } from "@/lib/runtime-location-state";

import type { CollectedLandingSpaces, LocationLandingSpaceAncestry } from "./types";

function visitTree(
  node: LocationsTreeNode,
  departmentId: string,
  departmentLabel: string,
  floorNodeId: string | null,
  floorName: string | null,
  neighborhoodNodeId: string | null,
  neighborhoodName: string | null,
  refs: RuntimeLocationSpaceRef[],
  ancestry: LocationLandingSpaceAncestry[],
  seen: Set<string>,
): void {
  const nextFloorId = node.kind === "FLOOR" ? node.id : floorNodeId;
  const nextFloorName = node.kind === "FLOOR" ? node.label : floorName;
  const nextNeighborhoodId = node.kind === "NEIGHBORHOOD" ? node.id : neighborhoodNodeId;
  const nextNeighborhoodName = node.kind === "NEIGHBORHOOD" ? node.label : neighborhoodName;

  if (node.kind === "ROOM" && node.presentation === "ACTIONABLE") {
    const key = `${departmentId}:${node.physicalId}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({
        spaceId: node.physicalId,
        departmentId,
        departmentLabel,
        unitId: node.unitId,
        displayName: node.label,
        floorName: nextFloorName,
        neighborhoodName: nextNeighborhoodName,
      });
      ancestry.push({
        spaceId: node.physicalId,
        spaceNodeId: node.id,
        neighborhoodNodeId: nextNeighborhoodId,
        floorNodeId: nextFloorId,
        departmentId,
      });
    }
  }

  for (const child of node.children) {
    visitTree(
      child,
      departmentId,
      departmentLabel,
      nextFloorId,
      nextFloorName,
      nextNeighborhoodId,
      nextNeighborhoodName,
      refs,
      ancestry,
      seen,
    );
  }
}

/** Visible ACTIONABLE SPACE ids, in hierarchy order. */
export function collectActionableLandingSpaces(
  view: LocationsViewModel,
): CollectedLandingSpaces {
  const refs: RuntimeLocationSpaceRef[] = [];
  const ancestry: LocationLandingSpaceAncestry[] = [];
  const seen = new Set<string>();

  for (const snapshot of view.departmentSnapshots) {
    for (const root of snapshot.roots) {
      visitTree(
        root,
        snapshot.departmentId,
        snapshot.label,
        null,
        null,
        null,
        null,
        refs,
        ancestry,
        seen,
      );
    }
  }

  return { refs, ancestry };
}
