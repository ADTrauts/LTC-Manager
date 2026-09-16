import type { HierarchyWalkUnit } from "@/lib/department-administration/department-locations";
import { collectDepartmentActionableLocations } from "@/lib/department-administration/department-locations";

function findUnitNodeById(
  roots: readonly HierarchyWalkUnit[],
  unitId: string,
): HierarchyWalkUnit | null {
  const visit = (node: HierarchyWalkUnit): HierarchyWalkUnit | null => {
    if (node.id === unitId) return node;
    for (const child of node.childUnits) {
      const hit = visit(child);
      if (hit) return hit;
    }
    return null;
  };

  for (const root of roots) {
    const hit = visit(root);
    if (hit) return hit;
  }
  return null;
}

function countActiveDescendantSpaces(node: HierarchyWalkUnit): number {
  let count = 0;
  const walk = (n: HierarchyWalkUnit) => {
    for (const space of n.childSpaces) {
      if (space.isActive) count += 1;
    }
    for (const child of n.childUnits) walk(child);
  };
  walk(node);
  return count;
}

/**
 * Resolve Floor (structural unit organizer) selection into department-operating Room spaces.
 *
 * Notes:
 * - Floors are never persisted as operational locations.
 * - Returned ids are always UnitSpace ids (room/spaces).
 */
export function resolveDepartmentRoomUnitSpaceIdsFromFloorSelection(input: {
  departmentId: string;
  units: readonly HierarchyWalkUnit[];
  floorUnitIds: readonly string[];
}): string[] {
  const out = new Set<string>();
  for (const floorId of input.floorUnitIds) {
    const floorNode = findUnitNodeById(input.units, floorId);
    if (!floorNode) throw new Error(`Floor unit "${floorId}" not found.`);

    const actionable = collectDepartmentActionableLocations({
      departmentId: input.departmentId,
      units: [floorNode],
    });

    for (const location of actionable) {
      if (location.kind !== "room") continue;
      if (!location.isActive) continue;
      out.add(location.id);
    }
  }
  return [...out].sort();
}

/**
 * Resolve Neighborhood selection into department-operating Room spaces.
 *
 * "Neighborhood actionable but has no Rooms" is represented by:
 * - `unitWideSemantics: true`
 * - `roomUnitSpaceIds: []`
 * so the caller can persist a UNIT-scoped assignment for that Neighborhood unit id.
 */
export function resolveDepartmentRoomUnitSpaceIdsFromNeighborhoodSelection(input: {
  departmentId: string;
  units: readonly HierarchyWalkUnit[];
  neighborhoodUnitId: string;
}): {
  roomUnitSpaceIds: string[];
  unitWideSemantics: boolean;
  hasAnyActiveDescendantSpaces: boolean;
} {
  const neighborhoodNode = findUnitNodeById(input.units, input.neighborhoodUnitId);
  if (!neighborhoodNode) throw new Error(`Neighborhood unit "${input.neighborhoodUnitId}" not found.`);

  const actionable = collectDepartmentActionableLocations({
    departmentId: input.departmentId,
    units: [neighborhoodNode],
  });

  const roomUnitSpaceIds = actionable
    .filter((l) => l.kind === "room" && l.isActive)
    .map((l) => l.id);

  const hasAnyActiveDescendantSpaces = countActiveDescendantSpaces(neighborhoodNode) > 0;

  const neighborhoodIsActionable = neighborhoodNode.departmentResponsibilities.some(
    (r) => r.department.id === input.departmentId,
  );

  // Only apply UNIT-scoped semantics when the neighborhood is actionable AND has no rooms at all.
  const unitWideSemantics = !hasAnyActiveDescendantSpaces && neighborhoodIsActionable && roomUnitSpaceIds.length === 0;

  return {
    roomUnitSpaceIds: [...new Set(roomUnitSpaceIds)].sort(),
    unitWideSemantics,
    hasAnyActiveDescendantSpaces,
  };
}

/**
 * Resolve explicit Room/Space scope (direct UnitSpace selection) into eligible department-operating rooms.
 */
export function resolveDepartmentEligibleRoomUnitSpaceIdsFromExplicitSelection(input: {
  departmentId: string;
  units: readonly HierarchyWalkUnit[];
  unitSpaceIds: readonly string[];
}): string[] {
  const idSet = new Set(input.unitSpaceIds);
  const out = new Set<string>();

  const walk = (node: HierarchyWalkUnit) => {
    for (const space of node.childSpaces) {
      if (!idSet.has(space.id)) continue;
      if (!space.isActive) continue;
      const hasDept = space.responsibilities.some((r) => r.department.id === input.departmentId);
      if (!hasDept) continue;
      out.add(space.id);
    }
    for (const child of node.childUnits) walk(child);
  };

  for (const root of input.units) walk(root);
  return [...out].sort();
}

