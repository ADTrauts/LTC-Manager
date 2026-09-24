/**
 * Collect supervisor operating locations from the Locations tree.
 *
 * Neighborhoods with actionable Department Rooms → one supervisor row.
 * Standalone actionable Rooms (no Neighborhood parent) → their own row.
 * Buildings and Floors are structural grouping only — never operating rows.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type { LocationsDepartmentSnapshot, LocationsTreeNode } from "@/lib/locations";

import type {
  SupervisorOperatingLocation,
  UnderlyingOperatingRoom,
} from "./types";

function collectActionableRooms(node: LocationsTreeNode): UnderlyingOperatingRoom[] {
  const rooms: UnderlyingOperatingRoom[] = [];
  const visit = (current: LocationsTreeNode) => {
    if (
      current.kind === "ROOM" &&
      current.presentation === "ACTIONABLE" &&
      current.href &&
      current.unitId
    ) {
      rooms.push({
        spaceId: current.physicalId,
        unitId: current.unitId,
        name: current.label,
        href: current.href,
        roomTypeLabel: null,
      });
    }
    for (const child of current.children) visit(child);
  };
  visit(node);
  return rooms;
}

function standaloneRoomFromNode(node: LocationsTreeNode): UnderlyingOperatingRoom | null {
  if (
    node.kind !== "ROOM" ||
    node.presentation !== "ACTIONABLE" ||
    !node.href ||
    !node.unitId
  ) {
    return null;
  }
  return {
    spaceId: node.physicalId,
    unitId: node.unitId,
    name: node.label,
    href: node.href,
    roomTypeLabel: null,
  };
}

export function collectSupervisorOperatingLocations(
  snapshots: readonly LocationsDepartmentSnapshot[],
): SupervisorOperatingLocation[] {
  const locations: SupervisorOperatingLocation[] = [];
  let facilityOrder = 0;

  const visit = (
    nodes: readonly LocationsTreeNode[],
    departmentKey: OperationalDepartmentKey | null,
    departmentLabel: string | null,
    floorLabel: string | null,
  ) => {
    for (const node of nodes) {
      const nextFloor = node.kind === "FLOOR" ? node.label : floorLabel;

      if (node.kind === "FACILITY" || node.kind === "BUILDING" || node.kind === "FLOOR") {
        visit(node.children, departmentKey, departmentLabel, nextFloor);
        continue;
      }

      if (node.kind === "NEIGHBORHOOD") {
        const rooms = collectActionableRooms(node);
        if (rooms.length > 0 && node.unitId) {
          locations.push({
            id: `neighborhood:${node.unitId}`,
            kind: "NEIGHBORHOOD",
            displayName: node.label,
            unitId: node.unitId,
            departmentKey,
            departmentLabel,
            floorLabel: nextFloor,
            facilityOrder: facilityOrder++,
            rooms,
          });
        }
        continue;
      }

      if (node.kind === "ROOM") {
        const room = standaloneRoomFromNode(node);
        if (room) {
          locations.push({
            id: `room:${room.spaceId}`,
            kind: "STANDALONE_ROOM",
            displayName: room.name,
            unitId: room.unitId,
            departmentKey,
            departmentLabel,
            floorLabel: nextFloor,
            facilityOrder: facilityOrder++,
            rooms: [room],
          });
        }
        continue;
      }

      if (node.kind === "LEGACY") {
        const rooms = collectActionableRooms(node);
        if (rooms.length > 0) {
          for (const room of rooms) {
            locations.push({
              id: `room:${room.spaceId}`,
              kind: "STANDALONE_ROOM",
              displayName: room.name,
              unitId: room.unitId,
              departmentKey,
              departmentLabel,
              floorLabel: nextFloor,
              facilityOrder: facilityOrder++,
              rooms: [room],
            });
          }
          continue;
        }
        if (node.presentation === "ACTIONABLE" && node.unitId && node.href) {
          locations.push({
            id: `legacy:${node.unitId}`,
            kind: "LEGACY_UNIT",
            displayName: node.label,
            unitId: node.unitId,
            departmentKey,
            departmentLabel,
            floorLabel: nextFloor,
            facilityOrder: facilityOrder++,
            rooms: [],
          });
          continue;
        }
      }

      visit(node.children, departmentKey, departmentLabel, nextFloor);
    }
  };

  for (const snapshot of snapshots) {
    visit(snapshot.roots, snapshot.departmentKey, snapshot.label, null);
  }

  return locations;
}
