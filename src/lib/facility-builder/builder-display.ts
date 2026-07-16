/**
 * Presentation-only hierarchy classification for Facility Builder.
 * Does not change schema, storage, or operational location models.
 */

export type BuilderNodeDisplayKind =
  | "floor"
  | "neighborhood"
  | "legacy_location";

export type ClassifiableUnit = {
  parentUnitId: string | null;
  childUnits: readonly unknown[];
};

/**
 * Conservative compatibility rule:
 * - Child units → Neighborhood
 * - Top-level with child units → Floor
 * - Top-level without child units → Legacy location (not labeled Floor)
 */
export function classifyBuilderUnit(unit: ClassifiableUnit): BuilderNodeDisplayKind {
  if (unit.parentUnitId != null) return "neighborhood";
  if (unit.childUnits.length > 0) return "floor";
  return "legacy_location";
}

export function displayKindLabel(kind: BuilderNodeDisplayKind): string {
  switch (kind) {
    case "floor":
      return "Floor";
    case "neighborhood":
      return "Neighborhood";
    case "legacy_location":
      return "Location";
  }
}

export function canAddNeighborhood(kind: BuilderNodeDisplayKind): boolean {
  return kind === "floor";
}

/** Rooms attach to neighborhoods; legacy locations may already host rooms. */
export function canAddRoom(kind: BuilderNodeDisplayKind): boolean {
  return kind === "neighborhood" || kind === "legacy_location";
}

/**
 * Unit DnD: only into Floors.
 * Floors stay top-level (cannot nest under Neighborhood/Floor via DnD).
 * Legacy locations and neighborhoods can move under a Floor.
 */
export function canMoveUnitOnto(
  dragKind: BuilderNodeDisplayKind,
  dropKind: BuilderNodeDisplayKind,
): boolean {
  if (dragKind === "floor") return false;
  return dropKind === "floor";
}

/** Rooms cannot land directly on Floors. */
export function canMoveRoomOnto(dropKind: BuilderNodeDisplayKind): boolean {
  return dropKind === "neighborhood" || dropKind === "legacy_location";
}

/** Next displayOrder for a new top-level Floor after existing roots. */
export function nextTopLevelDisplayOrder(
  topLevelUnits: readonly { displayOrder: number }[],
): number {
  if (topLevelUnits.length === 0) return 100;
  const max = Math.max(...topLevelUnits.map((u) => u.displayOrder));
  return Math.min(9999, max + 10);
}

/** Floor create payload always uses parentUnitId = null. */
export function floorCreateParentUnitId(): null {
  return null;
}
