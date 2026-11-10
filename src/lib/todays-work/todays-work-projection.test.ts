/**
 * Today's Work projection supplies the Units an employee may see.
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { UnitType } from "@prisma/client";

import {
  DIETARY_GOLDEN_PROJECTION,
  EVS_GOLDEN_PROJECTION,
  FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  PERMISSION_NARROWED_PROJECTION,
  PLANT_GOLDEN_PROJECTION,
} from "@/lib/projection";
import {
  adaptProjectionToTodaysWork,
  filterWalkListToProjectedUnits,
} from "@/lib/todays-work/projection";
import type { WalkListData, WalkListItem } from "@/lib/todays-work";

function walkItem(unitId: string, name: string, score = 1): WalkListItem {
  return {
    unitId,
    unitName: name,
    unitType: "SERVERY" as UnitType,
    status: "blocked",
    reason: "test",
    href: `/unit/${unitId}`,
    failed: 1,
    missed: 0,
    pending: 0,
    openRepairCount: 0,
    staffingCount: 1,
    attentionScore: score,
  };
}

test("Dietary projected units follow responsible rooms", () => {
  const view = adaptProjectionToTodaysWork(DIETARY_GOLDEN_PROJECTION);
  assert.ok(view.projectedUnitIds.includes("unit_kensington"));
  assert.ok(view.actionableUnitIds.includes("unit_kensington"));
  assert.equal(view.error, null);
});

test("EVS projected units stay on the EVS snapshot", () => {
  const view = adaptProjectionToTodaysWork(EVS_GOLDEN_PROJECTION);
  assert.deepEqual(view.projectedUnitIds, ["unit_ground_floor", "unit_kensington"]);
  assert.deepEqual(view.actionableUnitIds, ["unit_kensington"]);
});

test("Plant policy does not create room assignments", () => {
  const view = adaptProjectionToTodaysWork(PLANT_GOLDEN_PROJECTION);
  assert.equal(PLANT_GOLDEN_PROJECTION.plantPolicy?.createsRoomAssignments, false);
  assert.ok(view.projectedUnitIds.includes("unit_kensington"));
});

test("Facility Overview stays a facility lens", () => {
  const view = adaptProjectionToTodaysWork(FACILITY_OVERVIEW_GOLDEN_PROJECTION);
  assert.equal(view.lensMode, "FACILITY");
  assert.equal(view.lensKey, "facility");
  assert.ok(view.projectedUnitIds.includes("unit_kensington"));
});

test("Permission narrowing does not add units", () => {
  const full = adaptProjectionToTodaysWork(DIETARY_GOLDEN_PROJECTION);
  const narrow = adaptProjectionToTodaysWork(PERMISSION_NARROWED_PROJECTION);
  assert.ok(narrow.projectedUnitIds.every((id) => full.projectedUnitIds.includes(id)));
});

test("Walk filter never broadens beyond Projection", () => {
  const view = adaptProjectionToTodaysWork(DIETARY_GOLDEN_PROJECTION);
  const walk: WalkListData = {
    items: [
      walkItem("unit_kensington", "Kensington", 10),
      walkItem("unit_not_projected", "Other", 99),
      walkItem("unit_ground_floor", "Ground", 5),
    ],
    summary: { total: 3, blocked: 3, inProgress: 0, ready: 0 },
    operationContext: {
      mealType: "LUNCH",
      mealLabel: "Lunch",
      serviceLabel: "Lunch",
      phase: "Execution",
      scheduledTimeLabel: null,
      minutesUntilService: null,
    },
    lookFirst: null,
  };
  const filtered = filterWalkListToProjectedUnits(walk, view.projectedUnitIds);
  assert.ok(filtered.items.every((item) => view.projectedUnitIds.includes(item.unitId)));
  assert.ok(!filtered.items.some((item) => item.unitId === "unit_not_projected"));
  assert.ok(filtered.summary.total <= walk.summary.total);
});

test("Projection failure empty view", () => {
  const view = adaptProjectionToTodaysWork(
    {
      ...DIETARY_GOLDEN_PROJECTION,
      locations: { roots: [], actionableIds: [], byId: {} },
    },
    "boom",
  );
  assert.equal(view.error, "boom");
  assert.equal(view.projectedUnitIds.length, 0);
});
