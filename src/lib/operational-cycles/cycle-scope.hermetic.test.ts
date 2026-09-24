import assert from "node:assert/strict";
import test from "node:test";

import {
  describeUserFacingScope,
  diffMilestoneTimes,
  groupCyclesForList,
  isStandardRoomTypeKey,
  isValidConfiguredTime,
  locationModeFromUserScope,
  mealTimeNeighborhoodCandidates,
  neighborhoodIdsFromScopedRooms,
  normalizeConfiguredTime,
  parseServiceStartTimesField,
  roomsMatchingRoomType,
  scopeGroupLabel,
  shouldShowServiceStartTimes,
  standardRoomTypeOptions,
  summarizeScopeChange,
  unitMayOwnConfiguredMealTime,
  userFacingScopeFromMode,
  validateCycleScopeAgainstCatalog,
} from "./cycle-scope";

test("standard Room Type keys include servery and exclude custom", () => {
  assert.equal(isStandardRoomTypeKey("servery"), true);
  assert.equal(isStandardRoomTypeKey("production_area"), true);
  assert.equal(isStandardRoomTypeKey("custom:kitchen"), false);
  assert.equal(isStandardRoomTypeKey("custom"), false);
  assert.ok(standardRoomTypeOptions().some((o) => o.key === "servery"));
  assert.equal(
    standardRoomTypeOptions().some((o) => o.key === "custom"),
    false,
  );
});

test("user-facing scope maps to persistence modes without Unit.unitType", () => {
  assert.equal(userFacingScopeFromMode("ALL_DEPARTMENT_UNITS"), "department");
  assert.equal(userFacingScopeFromMode("OPERATIONAL_TYPES"), "operational_types");
  assert.equal(userFacingScopeFromMode("ROOM_TYPE"), "room_type");
  assert.equal(userFacingScopeFromMode("EXPLICIT_UNITS"), "specific");
  assert.equal(userFacingScopeFromMode("UNIT_TYPES"), "department");
  assert.equal(locationModeFromUserScope("department"), "ALL_DEPARTMENT_UNITS");
  assert.equal(locationModeFromUserScope("operational_types"), "OPERATIONAL_TYPES");
  assert.equal(locationModeFromUserScope("room_type"), "ROOM_TYPE");
  assert.equal(locationModeFromUserScope("specific"), "EXPLICIT_UNITS");
});

test("configured times normalize and floors cannot own meal times", () => {
  assert.equal(normalizeConfiguredTime("7:15"), "07:15");
  assert.equal(isValidConfiguredTime("07:15"), true);
  assert.equal(isValidConfiguredTime("25:00"), false);
  assert.equal(unitMayOwnConfiguredMealTime({ hierarchyRole: "NEIGHBORHOOD" }), true);
  assert.equal(unitMayOwnConfiguredMealTime({ hierarchyRole: "FLOOR" }), false);
  assert.equal(unitMayOwnConfiguredMealTime({ hierarchyRole: "BUILDING" }), false);
});

test("Room Type Servery resolves unique parent Neighborhoods and skips orphans", () => {
  const rooms = [
    {
      id: "s1",
      kind: "room" as const,
      name: "Naval Park Servery",
      roomTypeKey: "servery",
      neighborhoodId: "np",
      neighborhoodName: "1A – Naval Park",
    },
    {
      id: "s2",
      kind: "room" as const,
      name: "Naval Park Servery 2",
      roomTypeKey: "servery",
      neighborhoodId: "np",
      neighborhoodName: "1A – Naval Park",
    },
    {
      id: "s3",
      kind: "room" as const,
      name: "Lighthouse Servery",
      roomTypeKey: "servery",
      neighborhoodId: "lh",
      neighborhoodName: "1B – Lighthouse",
    },
    {
      id: "orphan",
      kind: "room" as const,
      name: "Ground Servery",
      roomTypeKey: "servery",
      neighborhoodId: null,
    },
    {
      id: "kitchen",
      kind: "room" as const,
      name: "Main Kitchen",
      roomTypeKey: "production_area",
      neighborhoodId: "ground",
    },
  ];
  const matching = roomsMatchingRoomType(rooms, "servery");
  assert.equal(matching.length, 4);
  assert.deepEqual(neighborhoodIdsFromScopedRooms(matching), ["np", "lh"]);
});

test("service start times only when SERVICE + mealType + SERVICE_STARTED", () => {
  assert.equal(
    shouldShowServiceStartTimes({
      cycleType: "SERVICE",
      mealType: "BREAKFAST",
      expectedMilestones: ["READY", "SERVICE_STARTED"],
    }),
    true,
  );
  assert.equal(
    shouldShowServiceStartTimes({
      cycleType: "PREPARATION",
      mealType: "BREAKFAST",
      expectedMilestones: ["SERVICE_STARTED"],
    }),
    false,
  );
  assert.equal(
    shouldShowServiceStartTimes({
      cycleType: "SERVICE",
      mealType: null,
      expectedMilestones: ["SERVICE_STARTED"],
    }),
    false,
  );
});

test("scope labels and review diffs stay human", () => {
  assert.equal(
    scopeGroupLabel({ locationMode: "ROOM_TYPE", roomTypeKey: "servery" }),
    "Serveries",
  );
  assert.equal(
    describeUserFacingScope({ locationMode: "ROOM_TYPE", roomTypeKey: "servery" }),
    "Room Type: Servery",
  );
  assert.equal(
    summarizeScopeChange({
      from: { locationMode: "ALL_DEPARTMENT_UNITS" },
      to: { locationMode: "ROOM_TYPE", roomTypeKey: "servery" },
    }),
    "Entire department → Room Type: Servery",
  );
  const diff = diffMilestoneTimes({
    prior: [
      { unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:15" },
      { unitId: "lh", milestone: "SERVICE_STARTED", configuredTime: "07:20" },
    ],
    next: [
      { unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:20" },
      { unitId: "lh", milestone: "SERVICE_STARTED", configuredTime: "07:20" },
    ],
    unitNames: { np: "Naval Park", lh: "Lighthouse" },
  });
  assert.equal(diff.changedCount, 1);
  assert.deepEqual(diff.summaries, ["Naval Park 07:15 → 07:20"]);
});

test("Room Type Servery candidates are unique Neighborhoods; floors skipped", () => {
  const locations = [
    {
      id: "np",
      kind: "neighborhood" as const,
      name: "1A – Naval Park",
      hierarchyRole: "NEIGHBORHOOD" as const,
    },
    {
      id: "lh",
      kind: "neighborhood" as const,
      name: "1B – Lighthouse",
      hierarchyRole: "NEIGHBORHOOD" as const,
    },
    {
      id: "fl",
      kind: "neighborhood" as const,
      name: "Floor 1",
      hierarchyRole: "FLOOR" as const,
    },
    {
      id: "s1",
      kind: "room" as const,
      name: "Naval Park Servery",
      roomTypeKey: "servery",
      neighborhoodId: "np",
    },
    {
      id: "s2",
      kind: "room" as const,
      name: "Naval Park Servery 2",
      roomTypeKey: "servery",
      neighborhoodId: "np",
    },
    {
      id: "s3",
      kind: "room" as const,
      name: "Lighthouse Servery",
      roomTypeKey: "servery",
      neighborhoodId: "lh",
    },
    {
      id: "kitchen",
      kind: "room" as const,
      name: "Main Kitchen",
      roomTypeKey: "production_area",
      neighborhoodId: null,
    },
  ];
  const rows = mealTimeNeighborhoodCandidates({
    locationMode: "ROOM_TYPE",
    roomTypeKey: "servery",
    locations,
  });
  assert.deepEqual(
    rows.map((r) => r.name),
    ["1A – Naval Park", "1B – Lighthouse"],
  );
  const kitchen = mealTimeNeighborhoodCandidates({
    locationMode: "EXPLICIT_UNITS",
    spaceIds: ["kitchen"],
    locations,
  });
  assert.equal(kitchen.length, 0);
});

test("catalog validation rejects floors, foreign locations, and custom Room Type keys", () => {
  const locations = [
    {
      id: "np",
      kind: "neighborhood" as const,
      name: "Naval Park",
      hierarchyRole: "NEIGHBORHOOD" as const,
    },
    {
      id: "kitchen",
      kind: "room" as const,
      name: "Main Kitchen",
      roomTypeKey: "production_area",
      neighborhoodId: null,
    },
  ];
  const floorTime = validateCycleScopeAgainstCatalog({
    locationMode: "ALL_DEPARTMENT_UNITS",
    cycleType: "SERVICE",
    mealType: "BREAKFAST",
    expectedMilestones: ["SERVICE_STARTED"],
    milestoneTimes: [{ unitId: "fl", milestone: "SERVICE_STARTED", configuredTime: "07:15" }],
    locations: [
      {
        id: "fl",
        kind: "neighborhood",
        name: "Floor 1",
        hierarchyRole: "FLOOR",
      },
    ],
  });
  assert.ok(floorTime.some((e) => /Floors/.test(e)));

  const foreign = validateCycleScopeAgainstCatalog({
    locationMode: "EXPLICIT_UNITS",
    unitIds: ["other"],
    cycleType: "PREPARATION",
    locations,
  });
  assert.ok(foreign.some((e) => /department/.test(e)));

  const custom = validateCycleScopeAgainstCatalog({
    locationMode: "ROOM_TYPE",
    roomTypeKey: "custom:banquet",
    cycleType: "SERVICE",
    mealType: "BREAKFAST",
    expectedMilestones: ["SERVICE_STARTED"],
    locations,
  });
  assert.ok(custom.some((e) => /standard Facility Room Type/.test(e)));
});

test("group headings are projections from scope", () => {
  const groups = groupCyclesForList(
    [
      { id: "a", locationMode: "ROOM_TYPE" as const, roomTypeKey: "servery" },
      { id: "b", locationMode: "EXPLICIT_UNITS" as const, spaceIds: ["k"] },
      { id: "c", locationMode: "ALL_DEPARTMENT_UNITS" as const },
    ],
    (row) =>
      scopeGroupLabel({
        locationMode: row.locationMode,
        roomTypeKey: "roomTypeKey" in row ? row.roomTypeKey : null,
        spaceIds: "spaceIds" in row ? row.spaceIds : [],
        locationNames: { k: "Main Kitchen" },
      }),
  );
  assert.deepEqual(
    groups.map((g) => g.heading),
    ["Serveries", "Main Kitchen", "Entire department"],
  );
});

test("17 neighborhoods can serialize distinct service start times", () => {
  const rows = Array.from({ length: 17 }, (_, i) => ({
    unitId: `u${i + 1}`,
    configuredTime: `07:${String(10 + i).padStart(2, "0")}`,
  }));
  const parsed = parseServiceStartTimesField(JSON.stringify(rows));
  assert.equal(parsed.length, 17);
  assert.equal(parsed[0]!.configuredTime, "07:10");
  assert.equal(parsed[16]!.configuredTime, "07:26");
  assert.equal(new Set(parsed.map((r) => r.unitId)).size, 17);
});
