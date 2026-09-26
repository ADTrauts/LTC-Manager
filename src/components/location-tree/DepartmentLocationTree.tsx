"use client";

import { useMemo } from "react";

import type { DepartmentAdminView } from "@/lib/department-administration";

type FloorGroup = DepartmentAdminView["locationHierarchy"][number];
type Room = DepartmentAdminView["locations"][number];

type Props = {
  floors: readonly FloorGroup[];
  floorLabel: string;
  neighborhoodLabel: string;
  selectedRoomId?: string | null;
  onSelectRoom?: (room: Room) => void;
};

function flattenRooms(floors: readonly FloorGroup[]): Room[] {
  const rooms: Room[] = [];
  for (const floor of floors) {
    rooms.push(...floor.orphanRooms);
    for (const { rooms: neighborhoodRooms } of floor.neighborhoods) {
      rooms.push(...neighborhoodRooms);
    }
  }
  return rooms;
}

function placeLabel(room: Room): string {
  return [room.parentNeighborhoodName, room.floorName].filter(Boolean).join(" · ");
}

function facilityTypeLabel(room: Room): string {
  return room.roomTypeLabel ?? "No physical type";
}

/**
 * Department Locations list. Floor and neighborhood are read-only context —
 * Facility Builder owns that structure, so they sit next to the room name.
 */
export function DepartmentLocationTree({
  floors,
  floorLabel,
  neighborhoodLabel,
  selectedRoomId = null,
  onSelectRoom,
}: Props) {
  const rooms = useMemo(() => flattenRooms(floors), [floors]);

  if (rooms.length === 0) return null;

  return (
    <div
      className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
      data-testid="department-location-tree"
    >
      <ul
        className="divide-y divide-zinc-100"
        aria-label={`Rooms this department operates, with ${neighborhoodLabel} and ${floorLabel} as context`}
      >
        {rooms.map((room) => {
          const place = placeLabel(room);
          const facilityType = facilityTypeLabel(room);
          const selected = selectedRoomId === room.id;
          return (
            <li key={room.id} data-testid="department-location-room">
              <button
                type="button"
                onClick={onSelectRoom ? () => onSelectRoom(room) : undefined}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 ${
                  selected ? "bg-zinc-50" : ""
                }`}
                data-testid="department-location-room-row"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-900">
                    {room.displayName}
                  </span>
                  <span
                    className="mt-0.5 block truncate text-xs text-zinc-500"
                    data-testid="department-location-facility-type"
                    title={[place, facilityType].filter(Boolean).join(" · ")}
                  >
                    {[place, facilityType].filter(Boolean).join(" · ") || "No physical type"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
