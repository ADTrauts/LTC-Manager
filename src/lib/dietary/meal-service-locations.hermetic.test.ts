import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("meal timing uses Key Time group rooms, not archetype bindings or Room Type", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/dietary/record-meal-timing.ts"),
    "utf8",
  );
  assert.match(source, /mealServiceLocationSpaceIds/);
  assert.match(source, /departmentOperationalCycleKeyTimeGroupRoom/);
  assert.doesNotMatch(source, /departmentRoomArchetypeBinding|FOOD_SERVICE_AREA_FUNCTION_KEY/);
  assert.doesNotMatch(source, /facilityRoomType|FacilityRoomType/);
  assert.match(source, /A cycle covering a room is not enough/);
});
