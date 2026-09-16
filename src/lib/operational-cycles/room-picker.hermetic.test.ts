import assert from "node:assert/strict";
import test from "node:test";

import {
  effectiveCycleSpaceIds,
  buildCyclesByStableKey,
} from "./effective-cycle-spaces";
import {
  groupRoomsForPicker,
  summarizeRoomSelection,
} from "./room-picker";
import type { CycleScopeLocationOption } from "./cycle-scope";

test("effectiveCycleSpaceIds inherits from parent when flagged", () => {
  const cycles = [
    {
      stableKey: "breakfast",
      parentStableKey: null,
      nodeKind: "PERIOD" as const,
      locationMode: "EXPLICIT_UNITS" as const,
      locationInheritFromParent: false,
      spaceIds: ["a", "b", "c", "d"],
      keyTimeGroups: [],
    },
    {
      stableKey: "prep",
      parentStableKey: "breakfast",
      nodeKind: "PERIOD" as const,
      locationMode: "EXPLICIT_UNITS" as const,
      locationInheritFromParent: true,
      spaceIds: [],
      keyTimeGroups: [],
    },
    {
      stableKey: "kitchen",
      parentStableKey: "breakfast",
      nodeKind: "PERIOD" as const,
      locationMode: "EXPLICIT_UNITS" as const,
      locationInheritFromParent: false,
      spaceIds: ["mk"],
      keyTimeGroups: [],
    },
  ];
  const byKey = buildCyclesByStableKey(cycles);
  assert.deepEqual(effectiveCycleSpaceIds(byKey.get("prep")!, byKey).sort(), [
    "a",
    "b",
    "c",
    "d",
  ]);
  assert.deepEqual(effectiveCycleSpaceIds(byKey.get("kitchen")!, byKey), ["mk"]);

  // Changing parent rooms updates inheriting child; explicit child stays put.
  byKey.get("breakfast")!.spaceIds = ["a", "b", "c", "d", "e"];
  assert.deepEqual(effectiveCycleSpaceIds(byKey.get("prep")!, byKey).sort(), [
    "a",
    "b",
    "c",
    "d",
    "e",
  ]);
  assert.deepEqual(effectiveCycleSpaceIds(byKey.get("kitchen")!, byKey), ["mk"]);
});

test("room picker filters by facilityRoomTypeId and select-all is explicit ids", () => {
  const locations: CycleScopeLocationOption[] = [
    {
      id: "r1",
      kind: "room",
      name: "Naval Park Servery",
      facilityRoomTypeId: "type-servery",
      roomTypeLabel: "Servery",
      neighborhoodId: "n1",
      neighborhoodName: "1A",
    },
    {
      id: "r2",
      kind: "room",
      name: "Main Kitchen",
      facilityRoomTypeId: "type-kitchen",
      roomTypeLabel: "Main Kitchen",
      neighborhoodId: "n0",
      neighborhoodName: "Ground",
    },
    {
      id: "r3",
      kind: "room",
      name: "Lighthouse Servery",
      facilityRoomTypeId: "type-servery",
      roomTypeLabel: "Servery",
      neighborhoodId: "n2",
      neighborhoodName: "1B",
    },
  ];

  const filtered = groupRoomsForPicker(locations, {
    facilityRoomTypeId: "type-servery",
  });
  const ids = filtered.flatMap((g) => g.rooms.map((r) => r.id)).sort();
  assert.deepEqual(ids, ["r1", "r3"]);
  assert.match(summarizeRoomSelection(["r1", "r3"], locations), /2|Servery/);
});

test("room picker labels Floor as structural context when floorName is present", () => {
  const groups = groupRoomsForPicker([
    {
      id: "r1",
      kind: "room",
      name: "Naval Park Servery",
      neighborhoodId: "n1",
      neighborhoodName: "Naval Park",
      floorName: "Floor 1",
    },
  ]);
  assert.equal(groups[0]?.label, "Floor 1 · Naval Park");
  assert.equal(groups[0]?.rooms[0]?.id, "r1");
});
