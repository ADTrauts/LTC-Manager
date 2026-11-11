import assert from "node:assert/strict";
import test from "node:test";

import {
  describeUserFacingScope,
  diffMilestoneTimes,
  groupCyclesForList,
  isValidConfiguredTime,
  locationModeFromUserScope,
  mealTimeNeighborhoodCandidates,
  normalizeConfiguredTime,
  parseServiceStartTimesField,
  scopeGroupLabel,
  shouldShowServiceStartTimes,
  summarizeScopeChange,
  unitMayOwnConfiguredMealTime,
  validateCycleScopeAgainstCatalog,
} from "./cycle-scope";

test("user-facing scope maps to persistence modes without Unit.unitType", () => {
  assert.equal(locationModeFromUserScope("department"), "ALL_DEPARTMENT_UNITS");
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
    scopeGroupLabel({ locationMode: "EXPLICIT_UNITS", spaceIds: ["s1"], locationNames: { s1: "Servery" } }),
    "Servery",
  );
  assert.equal(
    describeUserFacingScope({ locationMode: "EXPLICIT_UNITS", spaceIds: ["s1", "s2"], locationNames: { s1: "Servery", s2: "Kitchen" } }),
    "Servery, Kitchen",
  );
  assert.equal(
    summarizeScopeChange({
      from: { locationMode: "ALL_DEPARTMENT_UNITS" },
      to: { locationMode: "EXPLICIT_UNITS", spaceIds: ["s1"] },
      locationNames: { s1: "Servery" },
    }),
    "Entire department → Servery",
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

test("Explicit room selections resolve unique parent Neighborhoods", () => {
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
    locationMode: "EXPLICIT_UNITS",
    spaceIds: ["s1", "s2", "s3"],
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

test("catalog validation rejects Floor meal times and foreign locations", () => {
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

});

test("group headings are projections from scope", () => {
  const groups = groupCyclesForList(
    [
      { id: "b", locationMode: "EXPLICIT_UNITS" as const, spaceIds: ["k"] },
      { id: "c", locationMode: "ALL_DEPARTMENT_UNITS" as const },
    ],
    (row) =>
      scopeGroupLabel({
        locationMode: row.locationMode,
        spaceIds: "spaceIds" in row ? row.spaceIds : [],
        locationNames: { k: "Main Kitchen" },
      }),
  );
  assert.deepEqual(
    groups.map((g) => g.heading),
    ["Main Kitchen", "Entire department"],
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
