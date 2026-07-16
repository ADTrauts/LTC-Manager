/**
 * Facility Builder hierarchy display classification.
 *
 * Explicit Unit.hierarchyRole is the source of truth going forward.
 * Child count must never determine structural role.
 * Null hierarchyRole uses parentUnitId compatibility fallback only.
 */

import {
  DEFAULT_BUILDER_COPY,
  type BuilderCopy,
} from "@/lib/facility-builder/facility-vocabulary";

export type BuilderNodeDisplayKind =
  | "floor"
  | "neighborhood"
  | "legacy_location"
  | "staged";

export type HierarchyRoleValue =
  | "FLOOR"
  | "NEIGHBORHOOD"
  | "LEGACY_LOCATION"
  | "STAGED"
  | null;

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
 * - STAGED → staged (builder-only Undesignated)
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
    case "STAGED":
      return "staged";
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

export function displayKindLabel(
  kind: BuilderNodeDisplayKind,
  copy: BuilderCopy = DEFAULT_BUILDER_COPY,
): string {
  switch (kind) {
    case "floor":
      return copy.labels.level1;
    case "neighborhood":
      return copy.labels.level2;
    case "legacy_location":
      return copy.labels.legacyLocation;
    case "staged":
      return copy.labels.undesignated;
  }
}

export function canAddNeighborhood(kind: BuilderNodeDisplayKind): boolean {
  return kind === "floor";
}

/**
 * Rooms may attach to Floors, Neighborhoods, legacy locations, or staged neighborhoods.
 * Undesignated rooms themselves use unitId = null (toolbar create).
 */
export function canAddRoom(kind: BuilderNodeDisplayKind): boolean {
  return (
    kind === "floor" ||
    kind === "neighborhood" ||
    kind === "legacy_location" ||
    kind === "staged"
  );
}

/**
 * Unit DnD: Floors stay top-level.
 * Staged / legacy / neighborhood may move onto a Floor.
 */
export function canMoveUnitOnto(
  dragKind: BuilderNodeDisplayKind,
  dropKind: BuilderNodeDisplayKind,
): boolean {
  if (dragKind === "floor") return false;
  return dropKind === "floor";
}

/** Rooms may land on Floor, Neighborhood, legacy, or staged. */
export function canMoveRoomOnto(dropKind: BuilderNodeDisplayKind): boolean {
  return (
    dropKind === "floor" ||
    dropKind === "neighborhood" ||
    dropKind === "legacy_location" ||
    dropKind === "staged"
  );
}

/** Drop target id for the Undesignated staging zone (client DnD only). */
export const UNDESIGNATED_DROP_ID = "__undesignated__";

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
  intent: "floor" | "neighborhood" | "staged",
): "FLOOR" | "NEIGHBORHOOD" | "STAGED" {
  if (intent === "floor") return "FLOOR";
  if (intent === "staged") return "STAGED";
  return "NEIGHBORHOOD";
}

/** After moving under a Floor, role becomes NEIGHBORHOOD. */
export function hierarchyRoleAfterMoveOntoFloor(): "NEIGHBORHOOD" {
  return "NEIGHBORHOOD";
}

/** After moving into Undesignated staging. */
export function hierarchyRoleAfterMoveToUndesignated(): "STAGED" {
  return "STAGED";
}
