/**
 * Facility room-type grouping for Department location presentation.
 * The type is owned by Facility Builder.
 */

import type { DepartmentActionableLocation } from "./department-locations";

export type FacilityRoomTypeGroup = {
  roomTypeKey: string | null;
  label: string;
  rooms: DepartmentActionableLocation[];
};

export function groupRoomsByFacilityRoomType(
  locations: readonly DepartmentActionableLocation[],
): FacilityRoomTypeGroup[] {
  const rooms = locations.filter((location) => location.kind === "room");
  const order: string[] = [];
  const byKey = new Map<string, FacilityRoomTypeGroup>();

  for (const room of rooms) {
    const key = room.roomTypeKey ?? "__none__";
    if (!byKey.has(key)) {
      order.push(key);
      byKey.set(key, {
        roomTypeKey: room.roomTypeKey,
        label: room.roomTypeLabel ?? "No physical type",
        rooms: [],
      });
    }
    byKey.get(key)!.rooms.push(room);
  }

  const named = order.filter((key) => key !== "__none__");
  const none = order.includes("__none__") ? ["__none__"] : [];
  return [...named, ...none].map((key) => byKey.get(key)!);
}
