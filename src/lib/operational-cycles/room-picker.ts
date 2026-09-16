/**
 * Room picker helpers for Operational Cycle Build (explicit room targeting).
 */

import type { CycleScopeLocationOption } from "./cycle-scope";

export type RoomPickerGroup = {
  id: string;
  label: string;
  rooms: Array<{
    id: string;
    name: string;
    roomTypeKey?: string | null;
    roomTypeLabel?: string | null;
  }>;
};

export type RoomPickerFilter = {
  /** Preset / identity key (matches CycleScopeLocationOption.roomTypeKey). */
  roomTypeKey?: string | null;
  /** Optional Facility Room Type id when catalog rows include it. */
  facilityRoomTypeId?: string | null;
};

function groupKeyForRoom(room: CycleScopeLocationOption): string {
  if (room.neighborhoodId && room.neighborhoodName) {
    return `nbhd:${room.neighborhoodId}`;
  }
  if (room.neighborhoodId) {
    return `nbhd:${room.neighborhoodId}`;
  }
  if (room.hierarchyRole === "FLOOR") {
    return `floor:${room.id}`;
  }
  if (room.floorName?.trim()) {
    return `floor-name:${room.floorName.trim()}`;
  }
  return "other";
}

function groupLabelForRoom(room: CycleScopeLocationOption): string {
  const neighborhood = room.neighborhoodName?.trim();
  const floor = room.floorName?.trim();
  if (neighborhood && floor) return `${floor} · ${neighborhood}`;
  if (neighborhood) return neighborhood;
  if (floor) return floor;
  if (room.hierarchyRole === "FLOOR") return room.name;
  return "Other rooms";
}

/** Filter catalog rooms and group by neighborhood / floor for picker UI. */
export function groupRoomsForPicker(
  locations: readonly CycleScopeLocationOption[],
  filter?: RoomPickerFilter,
): RoomPickerGroup[] {
  const rooms = locations.filter((row) => {
    if (row.kind !== "room") return false;
    if (filter?.roomTypeKey && row.roomTypeKey !== filter.roomTypeKey) return false;
    if (filter?.facilityRoomTypeId) {
      const extended = row as CycleScopeLocationOption & { facilityRoomTypeId?: string | null };
      if (extended.facilityRoomTypeId !== filter.facilityRoomTypeId) return false;
    }
    return true;
  });

  const groups = new Map<string, RoomPickerGroup>();
  for (const room of rooms) {
    const key = groupKeyForRoom(room);
    const existing = groups.get(key);
    const entry = {
      id: room.id,
      name: room.name,
      roomTypeKey: room.roomTypeKey,
      roomTypeLabel: room.roomTypeLabel,
    };
    if (existing) {
      existing.rooms.push(entry);
      continue;
    }
    groups.set(key, {
      id: key,
      label: groupLabelForRoom(room),
      rooms: [entry],
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      rooms: group.rooms.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function allRoomIdsInGroups(groups: readonly RoomPickerGroup[]): string[] {
  return groups.flatMap((group) => group.rooms.map((room) => room.id));
}

export function toggleRoomSelection(
  selected: readonly string[],
  roomId: string,
  on: boolean,
): string[] {
  const set = new Set(selected);
  if (on) set.add(roomId);
  else set.delete(roomId);
  return [...set];
}

export function toggleGroupSelection(
  selected: readonly string[],
  group: RoomPickerGroup,
  on: boolean,
): string[] {
  let next = [...selected];
  for (const room of group.rooms) {
    next = toggleRoomSelection(next, room.id, on);
  }
  return next;
}

export function isGroupFullySelected(group: RoomPickerGroup, selected: readonly string[]): boolean {
  return group.rooms.length > 0 && group.rooms.every((room) => selected.includes(room.id));
}

export function summarizeRoomSelection(
  selected: readonly string[],
  locations: readonly CycleScopeLocationOption[],
): string {
  if (selected.length === 0) return "No rooms selected";
  const names = new Map(locations.filter((l) => l.kind === "room").map((l) => [l.id, l.name]));
  if (selected.length <= 3) {
    return selected.map((id) => names.get(id) ?? "Room").join(", ");
  }
  return `${selected.length} rooms selected`;
}
