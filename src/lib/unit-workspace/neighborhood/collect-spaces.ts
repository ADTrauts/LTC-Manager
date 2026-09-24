/**
 * Department-visible ACTIONABLE child SPACE refs for one Unit/Neighborhood.
 * Walks the existing Locations projection tree. Does not infer rooms from catalogs.
 */

import { collectActionableLandingSpaces } from "@/lib/locations/landing/collect-spaces";
import type { LocationsTreeNode, LocationsViewModel } from "@/lib/locations/types";
import type { RuntimeLocationSpaceRef } from "@/lib/runtime-location-state";

import type { CollectedLandingSpaces, LocationLandingSpaceAncestry } from "@/lib/locations/landing/types";

function isNeighborhoodOrLegacyUnit(node: LocationsTreeNode, unitId: string): boolean {
  if (node.physicalId !== unitId) return false;
  return node.kind === "NEIGHBORHOOD" || node.kind === "LEGACY";
}

function visit(
  node: LocationsTreeNode,
  departmentId: string,
  departmentLabel: string,
  unitId: string,
  underUnit: boolean,
  floorName: string | null,
  neighborhoodName: string | null,
  refs: RuntimeLocationSpaceRef[],
  ancestry: LocationLandingSpaceAncestry[],
  seen: Set<string>,
): void {
  const nextUnderUnit = underUnit || isNeighborhoodOrLegacyUnit(node, unitId);
  const nextFloor = node.kind === "FLOOR" ? node.label : floorName;
  const nextNeighborhood =
    node.kind === "NEIGHBORHOOD" || node.kind === "LEGACY" ? node.label : neighborhoodName;
  const matchesRoom =
    node.kind === "ROOM" &&
    node.presentation === "ACTIONABLE" &&
    (nextUnderUnit || node.unitId === unitId);

  if (matchesRoom) {
    const key = `${departmentId}:${node.physicalId}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({
        spaceId: node.physicalId,
        departmentId,
        departmentLabel,
        unitId: node.unitId ?? unitId,
        displayName: node.label,
        floorName: nextFloor,
        neighborhoodName: nextNeighborhood,
      });
      ancestry.push({
        spaceId: node.physicalId,
        spaceNodeId: node.id,
        neighborhoodNodeId: null,
        floorNodeId: null,
        departmentId,
      });
    }
  }

  for (const child of node.children) {
    visit(
      child,
      departmentId,
      departmentLabel,
      unitId,
      nextUnderUnit,
      nextFloor,
      nextNeighborhood,
      refs,
      ancestry,
      seen,
    );
  }
}

/** ACTIONABLE child SPACE refs for this Unit. Floors never enter the walk as the unit. */
export function collectNeighborhoodActionableSpaces(
  view: LocationsViewModel,
  unitId: string,
): CollectedLandingSpaces {
  const refs: RuntimeLocationSpaceRef[] = [];
  const ancestry: LocationLandingSpaceAncestry[] = [];
  const seen = new Set<string>();

  for (const snapshot of view.departmentSnapshots) {
    for (const root of snapshot.roots) {
      visit(
        root,
        snapshot.departmentId,
        snapshot.label,
        unitId,
        false,
        null,
        null,
        refs,
        ancestry,
        seen,
      );
    }
  }

  if (refs.length === 0) {
    const all = collectActionableLandingSpaces(view);
    const filtered = all.refs.filter((row) => row.unitId === unitId);
    const ids = new Set(filtered.map((row) => `${row.departmentId}:${row.spaceId}`));
    return {
      refs: filtered,
      ancestry: all.ancestry.filter((row) => ids.has(`${row.departmentId}:${row.spaceId}`)),
    };
  }

  return { refs, ancestry };
}

export function isStructuralNeighborhoodUnit(
  hierarchyRole: string | null | undefined,
): boolean {
  return hierarchyRole === "FLOOR" || hierarchyRole === "BUILDING";
}
