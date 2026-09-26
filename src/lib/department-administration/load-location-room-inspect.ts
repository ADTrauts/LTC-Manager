/**
 * Load director-facing room inspect data for Department Locations.
 * Projects Location Programs; does not compose a second program.
 */

import type { DepartmentActionableLocation } from "./department-locations";
import { loadLocationPrograms } from "./load-location-program";
import {
  toLocationRoomInspect,
  type LocationRoomInspectView,
} from "./location-room-inspect";

export async function loadDepartmentLocationRoomInspects(input: {
  facilityId: string;
  department: { id: string; name: string };
  locations: readonly DepartmentActionableLocation[];
}): Promise<Record<string, LocationRoomInspectView>> {
  const { programs, catalogOptions, logsEnabled } = await loadLocationPrograms(input);
  const inspects: Record<string, LocationRoomInspectView> = {};
  for (const [spaceId, program] of Object.entries(programs)) {
    inspects[spaceId] = toLocationRoomInspect(program, { catalogOptions, logsEnabled });
  }
  return inspects;
}
