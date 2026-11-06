/**
 * Apply viewer Team Room scope onto collected supervisor operating locations.
 * Neighborhood rows remain if at least one scoped Room remains; facts later
 * aggregate only those remaining Rooms.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";

import type { ViewerTeamScope } from "../viewer-team-scope";
import type { SupervisorOperatingLocation } from "./types";

export function applyViewerTeamScopeToLocations(
  locations: readonly SupervisorOperatingLocation[],
  scopesByDepartmentId: ReadonlyMap<string, ViewerTeamScope>,
  departmentIdByKey: ReadonlyMap<OperationalDepartmentKey, string>,
): SupervisorOperatingLocation[] {
  const scoped: SupervisorOperatingLocation[] = [];

  for (const location of locations) {
    const departmentId = location.departmentKey
      ? departmentIdByKey.get(location.departmentKey)
      : undefined;
    const scope = departmentId ? scopesByDepartmentId.get(departmentId) : undefined;

    if (!scope || scope.mode === "DEPARTMENT_WIDE") {
      scoped.push(location);
      continue;
    }

    if (scope.mode === "TEAM_WITHOUT_LOCATIONS") {
      continue;
    }

    const allowed = new Set(scope.roomIds);
    const rooms = location.rooms.filter((room) => allowed.has(room.spaceId));
    if (rooms.length === 0) continue;
    scoped.push({ ...location, rooms });
  }

  return scoped;
}

/** Team room IDs that remain after EmployeeUnitAccess / Department footprint collection. */
export function intersectTeamRoomsWithCollectedLocations(
  roomIds: readonly string[],
  locations: readonly SupervisorOperatingLocation[],
): string[] {
  const present = new Set<string>();
  for (const location of locations) {
    for (const room of location.rooms) present.add(room.spaceId);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const roomId of roomIds) {
    if (!present.has(roomId) || seen.has(roomId)) continue;
    seen.add(roomId);
    out.push(roomId);
  }
  return out;
}
