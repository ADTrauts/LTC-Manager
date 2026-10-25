import assert from "node:assert/strict";
import test from "node:test";

import {
  isDryStorage,
  isGaugeEquipment,
  isMechanicalRoom,
  isRestroom,
} from "./schedule-check";

test("a mechanical room is the inspection place", () => {
  assert.equal(isMechanicalRoom({ roomTypeKey: "mechanical_room", name: "Boiler Room" }), true);
  assert.equal(isMechanicalRoom({ roomTypeKey: "kitchen", name: "Main Kitchen" }), false);
});

test("a restroom and dry storage match their rounds", () => {
  assert.equal(isRestroom({ roomTypeKey: null, name: "First floor restroom" }), true);
  assert.equal(isDryStorage({ roomTypeKey: "dry_storage", name: "Storeroom" }), true);
  assert.equal(isDryStorage({ roomTypeKey: "cooler", name: "Walk-in" }), false);
});

test("a boiler or gauge reading is equipment, not a work order", () => {
  assert.equal(isGaugeEquipment({ name: "Boiler 1", equipmentType: "Heating" }), true);
  assert.equal(isGaugeEquipment({ name: "Dish machine", equipmentType: "Warewash" }), false);
});
