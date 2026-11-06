import assert from "node:assert/strict";
import test from "node:test";
import type { MealType, OperationalCycleLocationMode, ServeryMilestone } from "@prisma/client";

import type { CycleScopeLocationOption } from "./cycle-scope";
import { planMealServiceDayExpectations } from "./plan-day-expectations";
import type { OperationalCycleDefinition } from "./types";

function cycle(
  overrides: Partial<OperationalCycleDefinition> & Pick<OperationalCycleDefinition, "id" | "label">,
): OperationalCycleDefinition {
  return {
    stableKey: overrides.stableKey ?? "breakfast-service",
    parentStableKey: overrides.parentStableKey ?? null,
    nodeKind: "PERIOD",
    version: overrides.version ?? 1,
    description: null,
    cycleType: "SERVICE",
    displaySequence: 1,
    startLocal: "07:00",
    endLocal: "09:30",
    overnight: false,
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
    effectiveTo: null,
    mealType: "BREAKFAST" as MealType,
    locationMode: "ROOM_TYPE" as OperationalCycleLocationMode,
    locationInheritFromParent: false,
    applicableUnitTypes: [],
    roomTypeKey: "servery",
    expectedMilestones: ["READY", "SERVICE_STARTED"] as ServeryMilestone[],
    status: "PUBLISHED",
    unitIds: [],
    spaceIds: [],
    milestoneTimes: [],
    keyTimeGroups: [],
    ...overrides,
  };
}

const locations: CycleScopeLocationOption[] = [
  {
    id: "np",
    kind: "neighborhood",
    name: "1A – Naval Park",
    hierarchyRole: "NEIGHBORHOOD",
  },
  {
    id: "lh",
    kind: "neighborhood",
    name: "1B – Lighthouse",
    hierarchyRole: "NEIGHBORHOOD",
  },
  {
    id: "ra",
    kind: "neighborhood",
    name: "Roosevelt Annex",
    hierarchyRole: "NEIGHBORHOOD",
  },
  {
    id: "kitchen",
    kind: "neighborhood",
    name: "Main Kitchen",
    hierarchyRole: "LEGACY_LOCATION",
  },
  {
    id: "np-s",
    kind: "room",
    name: "Naval Park Servery",
    roomTypeKey: "servery",
    neighborhoodId: "np",
    neighborhoodName: "1A – Naval Park",
  },
  {
    id: "lh-s",
    kind: "room",
    name: "Lighthouse Servery",
    roomTypeKey: "servery",
    neighborhoodId: "lh",
    neighborhoodName: "1B – Lighthouse",
  },
  {
    id: "ra-s",
    kind: "room",
    name: "Roosevelt Annex Servery",
    roomTypeKey: "servery",
    neighborhoodId: "ra",
    neighborhoodName: "Roosevelt Annex",
  },
  {
    id: "mk",
    kind: "room",
    name: "Main Kitchen Room",
    roomTypeKey: "production_area",
    neighborhoodId: "kitchen",
    neighborhoodName: "Main Kitchen",
  },
];

test("ROOM_TYPE Servery resolves unique Neighborhoods and configured times", () => {
  const planned = planMealServiceDayExpectations({
    cycles: [
      cycle({
        id: "c-v3",
        label: "Breakfast Service",
        version: 3,
        milestoneTimes: [
          { unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:15" },
          { unitId: "lh", milestone: "SERVICE_STARTED", configuredTime: "07:20" },
        ],
      }),
    ],
    locations,
    existing: [],
  });

  assert.deepEqual(
    planned.map((row) => ({ unitId: row.unitId, configuredTime: row.configuredTime })).sort((a, b) =>
      a.unitId.localeCompare(b.unitId),
    ),
    [
      { unitId: "lh", configuredTime: "07:20" },
      { unitId: "np", configuredTime: "07:15" },
      { unitId: "ra", configuredTime: null },
    ],
  );
  assert.ok(planned.every((row) => row.cycleVersion === 3 && row.cycleStableKey === "breakfast-service"));
});

test("missing configured time is planned as null — not guessed or copied", () => {
  const planned = planMealServiceDayExpectations({
    cycles: [
      cycle({
        id: "c1",
        label: "Breakfast Service",
        milestoneTimes: [
          { unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:15" },
        ],
      }),
    ],
    locations,
    existing: [],
  });
  const annex = planned.find((row) => row.unitId === "ra");
  assert.ok(annex);
  assert.equal(annex!.configuredTime, null);
  assert.equal(planned.find((row) => row.unitId === "np")?.configuredTime, "07:15");
});

test("draft cycles do not plan runtime expectations", () => {
  const planned = planMealServiceDayExpectations({
    cycles: [
      cycle({
        id: "draft",
        label: "Breakfast Service",
        status: "DRAFT",
        milestoneTimes: [
          { unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:15" },
        ],
      }),
    ],
    locations,
    existing: [],
  });
  assert.equal(planned.length, 0);
});

test("already-materialized cycle is frozen — no new locations, no overwrite", () => {
  const planned = planMealServiceDayExpectations({
    cycles: [
      cycle({
        id: "c-v3",
        label: "Breakfast Service",
        version: 3,
        milestoneTimes: [
          { unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:30" },
          { unitId: "lh", milestone: "SERVICE_STARTED", configuredTime: "07:20" },
        ],
      }),
    ],
    locations,
    existing: [{ cycleId: "c-v3", unitId: "np", milestone: "SERVICE_STARTED" }],
  });
  assert.equal(planned.length, 0);
});

test("historical v1 freeze vs later v2 is a different cycle id", () => {
  const v1 = cycle({
    id: "c-v1",
    label: "Breakfast Service",
    version: 1,
    milestoneTimes: [{ unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:15" }],
  });
  const v2 = cycle({
    id: "c-v2",
    label: "Breakfast Service",
    version: 2,
    stableKey: "breakfast-service",
    milestoneTimes: [{ unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:20" }],
  });

  const dayA = planMealServiceDayExpectations({
    cycles: [v1],
    locations,
    existing: [],
  });
  assert.equal(dayA.find((row) => row.unitId === "np")?.configuredTime, "07:15");
  assert.equal(dayA.find((row) => row.unitId === "np")?.cycleVersion, 1);

  const dayAAgain = planMealServiceDayExpectations({
    cycles: [v2],
    locations,
    existing: dayA.map((row) => ({
      cycleId: row.cycleId,
      cycleStableKey: row.cycleStableKey,
      unitId: row.unitId,
      milestone: row.milestone,
    })),
  });
  assert.equal(dayAAgain.length, 0);

  const dayB = planMealServiceDayExpectations({
    cycles: [v2],
    locations,
    existing: [],
  });
  assert.equal(dayB.find((row) => row.unitId === "np")?.configuredTime, "07:20");
  assert.equal(dayB.find((row) => row.unitId === "np")?.cycleVersion, 2);
});

test("entire-department does not invent meal times for locations without configured rows", () => {
  const planned = planMealServiceDayExpectations({
    cycles: [
      cycle({
        id: "c-all",
        label: "Breakfast Service",
        locationMode: "ALL_DEPARTMENT_UNITS",
        roomTypeKey: null,
        milestoneTimes: [
          { unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:15" },
        ],
      }),
    ],
    locations,
    existing: [],
  });
  assert.deepEqual(
    planned.map((row) => row.unitId),
    ["np"],
  );
});

test("specific kitchen/retail rooms do not force neighborhood meal-start rows", () => {
  const planned = planMealServiceDayExpectations({
    cycles: [
      cycle({
        id: "c-prod",
        label: "Breakfast Production",
        locationMode: "EXPLICIT_UNITS",
        roomTypeKey: null,
        unitIds: [],
        spaceIds: ["mk"],
        mealType: "BREAKFAST",
        milestoneTimes: [],
      }),
    ],
    locations,
    existing: [],
  });
  assert.equal(planned.length, 0);
});

test("explicit Neighborhood with a configured SERVICE_STARTED time materializes", () => {
  const planned = planMealServiceDayExpectations({
    cycles: [
      cycle({
        id: "c-retail",
        label: "Retail Breakfast",
        locationMode: "EXPLICIT_UNITS",
        roomTypeKey: null,
        unitIds: ["np"],
        spaceIds: [],
        milestoneTimes: [
          { unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:00" },
        ],
      }),
    ],
    locations,
    existing: [],
  });
  assert.equal(planned.length, 1);
  assert.equal(planned[0]?.unitId, "np");
  assert.equal(planned[0]?.configuredTime, "07:00");
});

test("child with null mealType inherits parent meal for service-time planning", () => {
  const planned = planMealServiceDayExpectations({
    cycles: [
      cycle({
        id: "breakfast",
        label: "Breakfast",
        stableKey: "breakfast",
        cycleType: "CUSTOM",
        mealType: "BREAKFAST",
        expectedMilestones: [],
        parentStableKey: null,
      }),
      cycle({
        id: "servery",
        label: "Servery Service",
        stableKey: "servery",
        parentStableKey: "breakfast",
        mealType: null,
        locationMode: "ROOM_TYPE",
        roomTypeKey: "servery",
        expectedMilestones: ["READY", "SERVICE_STARTED"],
        milestoneTimes: [
          { unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:15" },
        ],
      }),
    ],
    locations,
    existing: [],
  });
  assert.equal(planned.length >= 1, true);
  assert.ok(planned.every((row) => row.cycleStableKey === "servery"));
  assert.ok(planned.every((row) => row.mealType === "BREAKFAST"));
  assert.equal(planned.find((row) => row.unitId === "np")?.configuredTime, "07:15");
});

test("parent umbrella does not duplicate child meal-service expectations", () => {
  const planned = planMealServiceDayExpectations({
    cycles: [
      cycle({
        id: "breakfast",
        label: "Breakfast",
        stableKey: "breakfast",
        cycleType: "CUSTOM",
        mealType: "BREAKFAST",
        expectedMilestones: [],
        locationMode: "ALL_DEPARTMENT_UNITS",
        parentStableKey: null,
      }),
      cycle({
        id: "servery",
        label: "Servery Service",
        stableKey: "servery",
        parentStableKey: "breakfast",
        mealType: null,
        locationMode: "ROOM_TYPE",
        roomTypeKey: "servery",
        expectedMilestones: ["READY", "SERVICE_STARTED"],
        milestoneTimes: [
          { unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:15" },
        ],
      }),
    ],
    locations,
    existing: [],
  });
  assert.equal(planned.some((row) => row.cycleStableKey === "breakfast"), false);
});

test("READY-only cycles do not create SERVICE_STARTED expectations", () => {
  const planned = planMealServiceDayExpectations({
    cycles: [
      cycle({
        id: "ready-only",
        label: "Prep",
        cycleType: "PREPARATION",
        mealType: null,
        expectedMilestones: ["READY"],
      }),
    ],
    locations,
    existing: [],
  });
  assert.equal(planned.length, 0);
});
