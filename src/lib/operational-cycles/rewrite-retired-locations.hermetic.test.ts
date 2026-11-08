import assert from "node:assert/strict";
import test from "node:test";

import { planRetiredCycleLocation } from "./rewrite-retired-locations";

const units = [
  { id: "floor", unitType: "RESIDENT_AREA", active: true },
  { id: "kitchen", unitType: "KITCHEN", active: true },
  { id: "closed", unitType: "KITCHEN", active: false },
];

const spaces = [
  { id: "servery", roomTypeKey: "servery", active: true },
  { id: "storage", roomTypeKey: "dry_storage", active: true },
  { id: "old", roomTypeKey: "servery", active: false },
];

test("a unit-type Cycle becomes the matching Department locations", () => {
  const plan = planRetiredCycleLocation({
    locationMode: "UNIT_TYPES",
    applicableUnitTypes: ["KITCHEN"],
    roomTypeKey: null,
    units,
    spaces,
  });
  assert.deepEqual(plan, { action: "explicit", unitIds: ["kitchen"], spaceIds: [] });
});

test("a room-type Cycle becomes the rooms of that type", () => {
  const plan = planRetiredCycleLocation({
    locationMode: "ROOM_TYPE",
    applicableUnitTypes: [],
    roomTypeKey: "servery",
    units,
    spaces,
  });
  assert.deepEqual(plan, { action: "explicit", unitIds: [], spaceIds: ["servery"] });
});

test("a Cycle with no matching location stays unmapped", () => {
  const plan = planRetiredCycleLocation({
    locationMode: "ROOM_TYPE",
    applicableUnitTypes: [],
    roomTypeKey: "mechanical",
    units,
    spaces,
  });
  assert.equal(plan.action, "unmapped");
});

test("an explicit Cycle is left as it is", () => {
  const plan = planRetiredCycleLocation({
    locationMode: "EXPLICIT_UNITS",
    applicableUnitTypes: [],
    roomTypeKey: null,
    units,
    spaces,
  });
  assert.equal(plan.action, "leave");
});
