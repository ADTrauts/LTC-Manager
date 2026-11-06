import assert from "node:assert/strict";
import test from "node:test";

import type { LocationRoomInspectView } from "./location-room-inspect";
import { presentLocationProgramExpansion } from "./location-program-expansion";

function inspect(partial: {
  spaceId: string;
  name: string;
  facilityTypeLabel: string;
  facilityRoomTypeId: string;
  team?: { id: string; name: string };
}): LocationRoomInspectView {
  return {
    spaceId: partial.spaceId,
    name: partial.name,
    place: "1",
    facilityTypeLabel: partial.facilityTypeLabel,
    facilityRoomTypeId: partial.facilityRoomTypeId,
    departmentId: "dept-1",
    departmentName: "Dietary",
    responsible: true,
    teams: partial.team
      ? [
          {
            id: partial.team.id,
            name: partial.team.name,
            provenance: { source: "TEAM_ROOM_MEMBERSHIP", detail: "Works this room" },
          },
        ]
      : [],
    cycles: [],
    logs: [],
    assets: [],
    addLogHref: null,
    catalogOptions: [],
  };
}

test("expansion lists remaining rooms of a Facility type and suggests the team already on that type", () => {
  const view = presentLocationProgramExpansion([
    inspect({
      spaceId: "kitchen",
      name: "Main Kitchen",
      facilityTypeLabel: "Production Space",
      facilityRoomTypeId: "prod",
      team: { id: "culinary", name: "Culinary" },
    }),
    inspect({
      spaceId: "prep",
      name: "Prep",
      facilityTypeLabel: "Production Space",
      facilityRoomTypeId: "prod",
    }),
    inspect({
      spaceId: "retail",
      name: "Retail",
      facilityTypeLabel: "Retail Space",
      facilityRoomTypeId: "retail",
    }),
  ]);

  assert.equal(view.programmedCount, 1);
  assert.equal(view.remainingCount, 2);
  assert.equal(view.groups[0]?.facilityTypeLabel, "Production Space");
  assert.deepEqual(view.groups[0]?.remaining.map((room) => room.name), ["Prep"]);
  assert.equal(view.groups[0]?.suggestedTeamName, "Culinary");
  assert.equal(view.groups[1]?.facilityTypeLabel, "Retail Space");
  assert.equal(view.groups[1]?.suggestedTeamId, null);
});
