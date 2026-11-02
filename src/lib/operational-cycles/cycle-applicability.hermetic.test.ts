import assert from "node:assert/strict";
import test from "node:test";

import { buildDietaryDefaultCyclePlans, buildEvsDefaultCyclePlans } from "./defaults";
import { effectiveCycleSpaceIds, buildCyclesByStableKey } from "./effective-cycle-spaces";
import { matchCycleApplicability } from "./cycle-applicability";
import { cycleAppliesToSpace, cycleAppliesToUnit, resolveOperationalCycle } from "./resolve-operational-cycle";
import type { OperationalCycleDefinition } from "./types";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function cycle(
  overrides: Partial<OperationalCycleDefinition> &
    Pick<OperationalCycleDefinition, "id" | "label">,
): OperationalCycleDefinition {
  return {
    stableKey: overrides.stableKey ?? overrides.id,
    parentStableKey: overrides.parentStableKey ?? null,
    nodeKind: "PERIOD",
    version: 1,
    description: null,
    cycleType: "SERVICE",
    displaySequence: 100,
    startLocal: "07:00",
    endLocal: "10:00",
    overnight: false,
    applicableDaysOfWeek: ALL_DAYS,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    mealType: "BREAKFAST",
    locationMode: "EXPLICIT_UNITS",
    locationInheritFromParent: false,
    applicableUnitTypes: [],
    applicableOperationalTypeKeys: [],
    expectedMilestones: [],
    status: "PUBLISHED",
    roomTypeKey: null,
    unitIds: [],
    spaceIds: [],
    milestoneTimes: [],
    keyTimeGroups: [],
    ...overrides,
  };
}

test("an explicit Cycle includes only the stored rooms", () => {
  const breakfast = cycle({
    id: "breakfast",
    label: "Breakfast",
    spaceIds: ["A", "B", "C"],
  });
  const byKey = buildCyclesByStableKey([breakfast]);
  for (const spaceId of ["A", "B", "C"]) {
    assert.equal(cycleAppliesToSpace(breakfast, spaceId, byKey), true, spaceId);
  }
  assert.equal(cycleAppliesToSpace(breakfast, "D", byKey), false);
  assert.equal(
    matchCycleApplicability({
      cycle: breakfast,
      allCyclesByStableKey: byKey,
      context: { spaceId: "D", physicalRoomTypeKey: "servery", operationalTypeKey: "food_service_area" },
    }),
    null,
  );
});

test("a new room with the same Facility Room Type does not join an explicit Cycle", () => {
  const breakfast = cycle({
    id: "breakfast",
    label: "Breakfast",
    spaceIds: ["A", "B", "C"],
  });
  const byKey = buildCyclesByStableKey([breakfast]);
  const createdLater = "D";
  assert.equal(
    cycleAppliesToSpace(breakfast, createdLater, byKey, {
      operationalTypeKey: "food_service_area",
    }),
    false,
  );
  assert.equal(
    matchCycleApplicability({
      cycle: breakfast,
      allCyclesByStableKey: byKey,
      context: {
        spaceId: createdLater,
        physicalRoomTypeKey: "servery",
        operationalTypeName: "Servery",
      },
    }),
    null,
  );
});

test("a department-wide Cycle follows Facility responsibility, including a place added later", () => {
  const cleaning = cycle({
    id: "morning",
    label: "Morning Operations",
    locationMode: "ALL_DEPARTMENT_UNITS",
    mealType: null,
    cycleType: "PREPARATION",
  });
  const byKey = buildCyclesByStableKey([cleaning]);
  assert.equal(
    cycleAppliesToSpace(cleaning, "A", byKey, { responsible: true }),
    true,
  );
  assert.equal(
    cycleAppliesToSpace(cleaning, "B", byKey, { responsible: true }),
    true,
  );
  assert.equal(
    cycleAppliesToSpace(cleaning, "outsider", byKey, { responsible: false }),
    false,
  );
  assert.equal(
    cycleAppliesToSpace(cleaning, "C", byKey, { responsible: true }),
    true,
  );
});

test("two Departments resolve the same room from their own explicit Cycles", () => {
  const shared = "room-1";
  const foodBreakfast = cycle({
    id: "food-breakfast",
    label: "Breakfast",
    spaceIds: [shared],
  });
  const evsCleaning = cycle({
    id: "evs-cleaning",
    label: "Morning Operations",
    spaceIds: [shared],
    mealType: null,
  });
  const evsOther = cycle({
    id: "evs-other",
    label: "Afternoon Operations",
    spaceIds: ["somewhere-else"],
    mealType: null,
  });
  assert.equal(
    cycleAppliesToSpace(foodBreakfast, shared, buildCyclesByStableKey([foodBreakfast])),
    true,
  );
  assert.equal(
    cycleAppliesToSpace(evsCleaning, shared, buildCyclesByStableKey([evsCleaning])),
    true,
  );
  assert.equal(
    cycleAppliesToSpace(evsOther, shared, buildCyclesByStableKey([evsOther]), {
      operationalTypeKey: "service_support",
    }),
    false,
  );
});

test("a draft Cycle does not become the Run operation", () => {
  const draft = cycle({
    id: "breakfast",
    label: "Breakfast",
    status: "DRAFT",
    startLocal: "11:00",
    endLocal: "13:00",
    spaceIds: ["A"],
  });
  const context = resolveOperationalCycle({
    cycles: [draft],
    now: new Date("2026-06-15T12:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-06-15",
    spaceId: "A",
  });
  assert.equal(context.state, "NOT_CONFIGURED");
});

test("a Key Point room group matches stored space ids only", () => {
  const ready = cycle({
    id: "breakfast_ready",
    label: "Breakfast Ready",
    nodeKind: "KEY_TIME",
    startLocal: null,
    endLocal: null,
    keyTimeGroups: [{ dueLocal: "07:05", spaceIds: ["A", "B"] }],
    applicableOperationalTypeKeys: ["food_service_area"],
  });
  const byKey = buildCyclesByStableKey([ready]);
  assert.deepEqual(effectiveCycleSpaceIds(ready, byKey), ["A", "B"]);
  assert.equal(cycleAppliesToSpace(ready, "A", byKey), true);
  assert.equal(cycleAppliesToSpace(ready, "C", byKey), false);
});

test("a selected neighborhood is that location and does not pull in its rooms", () => {
  const breakfast = cycle({
    id: "breakfast",
    label: "Breakfast",
    unitIds: ["neighborhood-1"],
    spaceIds: [],
  });
  const byKey = buildCyclesByStableKey([breakfast]);
  assert.equal(cycleAppliesToSpace(breakfast, "room-in-neighborhood", byKey), false);
  assert.equal(
    cycleAppliesToUnit(
      breakfast,
      { id: "neighborhood-1", unitType: "RESIDENT_AREA", spaceIds: ["room-in-neighborhood"] },
      byKey,
    ),
    true,
  );
});

test("retired location modes do not match a room", () => {
  for (const locationMode of ["OPERATIONAL_TYPES", "ROOM_TYPE", "UNIT_TYPES"] as const) {
    const row = cycle({
      id: locationMode,
      label: locationMode,
      locationMode,
      applicableOperationalTypeKeys: ["food_service_area"],
      roomTypeKey: "servery",
      applicableUnitTypes: ["RESIDENT_AREA"],
    });
    const byKey = buildCyclesByStableKey([row]);
    assert.equal(
      cycleAppliesToSpace(row, "A", byKey, { operationalTypeKey: "food_service_area" }),
      false,
      locationMode,
    );
  }
});

test("starters do not emit Location Function keys", () => {
  const dietary = JSON.stringify(buildDietaryDefaultCyclePlans());
  const evs = JSON.stringify(buildEvsDefaultCyclePlans());
  assert.equal(dietary.includes("food_service_area"), false);
  assert.equal(dietary.includes("OPERATIONAL_TYPES"), false);
  assert.equal(evs.includes("resident_care"), false);
  assert.equal(evs.includes("service_support"), false);
  assert.ok(buildEvsDefaultCyclePlans().every((plan) => plan.locationMode === "ALL_DEPARTMENT_UNITS"));
  assert.ok(
    buildDietaryDefaultCyclePlans()
      .filter((plan) => plan.parentStableKey == null)
      .every((plan) => plan.locationMode === "EXPLICIT_UNITS"),
  );
});
