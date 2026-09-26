/**
 * Remaining rooms of a Facility type that are not yet on a team.
 * Directors apply the same program by adding those rooms to the team
 * that already works that type. Same path for Dietary, EVS, and Plant.
 */

import type { LocationRoomInspectView } from "./location-room-inspect";

export type LocationProgramExpansionGroup = {
  facilityTypeLabel: string;
  facilityRoomTypeId: string | null;
  programmedCount: number;
  remaining: Array<{ spaceId: string; name: string }>;
  suggestedTeamId: string | null;
  suggestedTeamName: string | null;
};

export type LocationProgramExpansionView = {
  remainingCount: number;
  programmedCount: number;
  groups: LocationProgramExpansionGroup[];
};

export function presentLocationProgramExpansion(
  inspects: readonly LocationRoomInspectView[],
): LocationProgramExpansionView {
  const byType = new Map<
    string,
    {
      facilityTypeLabel: string;
      facilityRoomTypeId: string | null;
      programmed: LocationRoomInspectView[];
      remaining: LocationRoomInspectView[];
    }
  >();

  for (const inspect of inspects) {
    const key = inspect.facilityRoomTypeId ?? inspect.facilityTypeLabel ?? "untyped";
    const group = byType.get(key) ?? {
      facilityTypeLabel: inspect.facilityTypeLabel ?? "No Facility type",
      facilityRoomTypeId: inspect.facilityRoomTypeId,
      programmed: [],
      remaining: [],
    };
    if (inspect.teams.length > 0) group.programmed.push(inspect);
    else group.remaining.push(inspect);
    byType.set(key, group);
  }

  const groups = [...byType.values()]
    .filter((group) => group.remaining.length > 0)
    .map((group) => {
      const suggested = group.programmed[0]?.teams[0] ?? null;
      return {
        facilityTypeLabel: group.facilityTypeLabel,
        facilityRoomTypeId: group.facilityRoomTypeId,
        programmedCount: group.programmed.length,
        remaining: group.remaining.map((room) => ({ spaceId: room.spaceId, name: room.name })),
        suggestedTeamId: suggested?.id ?? null,
        suggestedTeamName: suggested?.name ?? null,
      };
    })
    .sort((a, b) => a.facilityTypeLabel.localeCompare(b.facilityTypeLabel));

  return {
    remainingCount: groups.reduce((sum, group) => sum + group.remaining.length, 0),
    programmedCount: inspects.filter((inspect) => inspect.teams.length > 0).length,
    groups,
  };
}
