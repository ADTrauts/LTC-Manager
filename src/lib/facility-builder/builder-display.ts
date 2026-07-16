/**
 * Facility Builder hierarchy display classification.
 *
 * Explicit Unit.hierarchyRole is the source of truth going forward.
 * Child count must never determine structural role.
 * Null hierarchyRole uses parentUnitId compatibility fallback only.
 */

export type BuilderNodeDisplayKind =
  | "floor"
  | "neighborhood"
  | "legacy_location";

export type HierarchyRoleValue = "FLOOR" | "NEIGHBORHOOD" | "LEGACY_LOCATION" | null;

export type ClassifiableUnit = {
  parentUnitId: string | null;
  hierarchyRole?: HierarchyRoleValue;
  /** @deprecated Child count must not determine role. Kept optional for call-site compatibility. */
  childUnits?: readonly unknown[];
};

/**
 * Resolve display kind from explicit hierarchyRole with null-compat fallback.
 *
 * - FLOOR → floor
 * - NEIGHBORHOOD → neighborhood
 * - LEGACY_LOCATION → legacy_location
 * - null + has parent → neighborhood
 * - null + no parent → legacy_location
 */
export function resolveBuilderNodeDisplayKind(
  unit: ClassifiableUnit,
): BuilderNodeDisplayKind {
  switch (unit.hierarchyRole) {
    case "FLOOR":
      return "floor";
    case "NEIGHBORHOOD":
      return "neighborhood";
    case "LEGACY_LOCATION":
      return "legacy_location";
    default:
      break;
  }

  if (unit.parentUnitId != null) return "neighborhood";
  return "legacy_location";
}

/** @deprecated Prefer resolveBuilderNodeDisplayKind */
export function classifyBuilderUnit(unit: ClassifiableUnit): BuilderNodeDisplayKind {
  return resolveBuilderNodeDisplayKind(unit);
}

export function displayKindLabel(kind: BuilderNodeDisplayKind): string {
  switch (kind) {
    case "floor":
      return "Floor";
    case "neighborhood":
      return "Neighborhood / Unit";
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

/** Internal UnitType for Floors — schema requires a value; hidden from Floor form. */
export const FLOOR_INTERNAL_UNIT_TYPE = "OTHER" as const;

/** Neutral UnitType for Neighborhood create — operational type is advanced-only. */
export const NEIGHBORHOOD_INTERNAL_UNIT_TYPE = "OTHER" as const;

export function hierarchyRoleForCreateIntent(
  intent: "floor" | "neighborhood",
): "FLOOR" | "NEIGHBORHOOD" {
  return intent === "floor" ? "FLOOR" : "NEIGHBORHOOD";
}

/** After moving under a Floor, role becomes NEIGHBORHOOD. */
export function hierarchyRoleAfterMoveOntoFloor(): "NEIGHBORHOOD" {
  return "NEIGHBORHOOD";
}
