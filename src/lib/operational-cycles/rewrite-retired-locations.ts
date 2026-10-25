/**
 * Move a Cycle that still names a unit type or a physical room type onto
 * the explicit Department locations that match that choice.
 * A Cycle with no matching location is left unchanged.
 */

export type RetiredCycleLocationPlan =
  | { action: "leave" }
  | { action: "explicit"; unitIds: string[]; spaceIds: string[] }
  | { action: "unmapped"; reason: string };

export function planRetiredCycleLocation(input: {
  locationMode: string;
  applicableUnitTypes: readonly string[];
  roomTypeKey: string | null;
  units: readonly { id: string; unitType: string; active?: boolean }[];
  spaces: readonly { id: string; roomTypeKey: string | null; active?: boolean }[];
}): RetiredCycleLocationPlan {
  if (input.locationMode !== "UNIT_TYPES" && input.locationMode !== "ROOM_TYPE") {
    return { action: "leave" };
  }

  if (input.locationMode === "UNIT_TYPES") {
    const wanted = new Set(input.applicableUnitTypes.filter(Boolean));
    if (wanted.size === 0) {
      return { action: "unmapped", reason: "No unit types are selected." };
    }
    const unitIds = [
      ...new Set(
        input.units
          .filter((unit) => unit.active !== false && wanted.has(unit.unitType))
          .map((unit) => unit.id),
      ),
    ];
    if (unitIds.length === 0) {
      return {
        action: "unmapped",
        reason: "No Department location has the selected unit type.",
      };
    }
    return { action: "explicit", unitIds, spaceIds: [] };
  }

  const key = input.roomTypeKey?.trim() ?? "";
  if (!key) {
    return { action: "unmapped", reason: "No room type is selected." };
  }
  const spaceIds = [
    ...new Set(
      input.spaces
        .filter((space) => space.active !== false && space.roomTypeKey?.trim() === key)
        .map((space) => space.id),
    ),
  ];
  if (spaceIds.length === 0) {
    return { action: "unmapped", reason: "No Department room uses that room type." };
  }
  return { action: "explicit", unitIds: [], spaceIds };
}
