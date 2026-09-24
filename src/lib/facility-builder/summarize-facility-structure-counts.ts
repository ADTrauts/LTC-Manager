import { resolveBuilderNodeDisplayKind } from "@/lib/facility-builder/builder-display";
import type { FacilityHierarchy, UnitHierarchyNode } from "@/lib/facility-builder/load-facility-hierarchy";

export type FacilityStructureCounts = {
  buildings: number;
  floors: number;
  neighborhoods: number;
  rooms: number;
  roomTypes: number;
};

/** Canonical Facility Builder structure counts (excludes display-only synthesis). */
export function summarizeFacilityStructureCounts(
  hierarchy: FacilityHierarchy,
): FacilityStructureCounts {
  let buildings = 0;
  let floors = 0;
  let neighborhoods = 0;
  let rooms = hierarchy.undesignatedSpaces.length;

  function walk(nodes: UnitHierarchyNode[]) {
    for (const unit of nodes) {
      const kind = resolveBuilderNodeDisplayKind(unit);
      if (kind === "building") buildings += 1;
      else if (kind === "floor") floors += 1;
      else if (kind === "neighborhood" || kind === "legacy_location") neighborhoods += 1;
      rooms += unit.childSpaces.length;
      walk(unit.childUnits);
    }
  }

  walk(hierarchy.units);
  walk(hierarchy.stagedUnits);

  const roomTypes = hierarchy.roomTypes.filter((row) => row.isActive).length;

  return { buildings, floors, neighborhoods, rooms, roomTypes };
}
