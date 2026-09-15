/**
 * Hierarchy-aware Daily Assignment scope labels for supervisors.
 * Floors / Neighborhoods are display aggregations; Room grain remains truth.
 */

export type ScopeHierarchyUnit = {
  name: string;
  hierarchyRole: string | null;
  parentUnit?: { name: string; hierarchyRole?: string | null } | null;
};

export type ScopeLocationInput = {
  labelSnapshot?: string | null;
  unitSpace?: {
    name: string;
    roomNumber?: string | null;
    unit?: ScopeHierarchyUnit | null;
  } | null;
};

function normalizeFloorLabel(raw: string): string {
  const trimmed = raw.trim();
  const match = /^floor\s+(.+)$/i.exec(trimmed);
  return match?.[1]?.trim() || trimmed;
}

/**
 * Prefer Floor / Neighborhood summaries when Rooms collapse cleanly.
 * Falls back to single Room label or "N Rooms".
 */
export function summarizeAssignmentScopeHierarchy(input: {
  locations: ScopeLocationInput[];
  unitName?: string | null;
}): string {
  const { locations, unitName = null } = input;
  if (locations.length === 0) {
    return unitName ? `${unitName} (entire Unit)` : "Entire Unit";
  }

  if (locations.length === 1) {
    const l = locations[0]!;
    return (
      l.labelSnapshot?.trim() ||
      [l.unitSpace?.roomNumber, l.unitSpace?.name].filter(Boolean).join(" • ") ||
      l.unitSpace?.name ||
      "1 Room"
    );
  }

  const floorLabels = new Set<string>();
  const neighborhoodLabels = new Set<string>();

  for (const loc of locations) {
    const u = loc.unitSpace?.unit;
    if (!u) continue;
    if (u.hierarchyRole === "FLOOR") {
      floorLabels.add(normalizeFloorLabel(u.name));
    } else if (u.hierarchyRole === "NEIGHBORHOOD") {
      neighborhoodLabels.add(u.name);
      if (u.parentUnit?.name) floorLabels.add(normalizeFloorLabel(u.parentUnit.name));
    } else if (u.parentUnit?.hierarchyRole === "FLOOR") {
      floorLabels.add(normalizeFloorLabel(u.parentUnit.name));
    } else if (u.parentUnit?.name) {
      neighborhoodLabels.add(u.name);
      floorLabels.add(normalizeFloorLabel(u.parentUnit.name));
    }
  }

  const floorArr = [...floorLabels].sort();
  const neighborhoodArr = [...neighborhoodLabels].sort();

  if (floorArr.length >= 2) {
    return floorArr.length === 2
      ? `Floors ${floorArr[0]} & ${floorArr[1]}`
      : `Floors ${floorArr.slice(0, 2).join(", ")} +${floorArr.length - 2} more`;
  }
  if (neighborhoodArr.length >= 2) {
    return neighborhoodArr.length === 2
      ? `${neighborhoodArr[0]} + ${neighborhoodArr[1]}`
      : `${neighborhoodArr[0]} + ${neighborhoodArr[1]} +${neighborhoodArr.length - 2} more`;
  }
  if (neighborhoodArr.length === 1) return neighborhoodArr[0]!;
  if (floorArr.length === 1) return `Floor ${floorArr[0]}`;

  return `${locations.length} Rooms`;
}
