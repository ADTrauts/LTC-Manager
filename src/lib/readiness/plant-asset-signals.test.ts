import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPmScheduleSignals,
  emptyPlantUnitSignals,
  groupOutOfServiceAssetsByUnit,
} from "@/lib/readiness/plant-asset-signals";

test("groupOutOfServiceAssetsByUnit ignores ACTIVE and RETIRED", () => {
  const map = groupOutOfServiceAssetsByUnit([
    { id: "1", unitId: "u1", name: "Cooler", status: "OUT_OF_SERVICE" },
    { id: "2", unitId: "u1", name: "Oven", status: "ACTIVE" },
    { id: "3", unitId: "u2", name: "Old unit", status: "RETIRED" },
  ]);
  assert.equal(map.get("u1")?.outOfServiceAssetCount, 1);
  assert.equal(map.get("u1")?.primaryOutOfServiceAssetName, "Cooler");
  assert.equal(map.has("u2"), false);
});

test("applyPmScheduleSignals marks overdue vs due-today underway", () => {
  const now = new Date("2026-07-08T15:00:00Z");
  const byUnit = new Map([["u1", emptyPlantUnitSignals()]]);
  applyPmScheduleSignals({
    byUnit,
    now,
    underwayScheduleIds: new Set(["pm-due"]),
    schedules: [
      {
        id: "pm-overdue",
        name: "Boiler inspection",
        nextDueAt: new Date("2026-07-07T12:00:00Z"),
        asset: { unitId: "u1", name: "Boiler", status: "ACTIVE" },
      },
      {
        id: "pm-due",
        name: "Filter change",
        nextDueAt: new Date("2026-07-08T18:00:00Z"),
        asset: { unitId: "u1", name: "AHU", status: "ACTIVE" },
      },
    ],
  });
  assert.equal(byUnit.get("u1")?.overduePmScheduleCount, 1);
  assert.equal(byUnit.get("u1")?.dueTodayPmScheduleCount, 1);
  assert.equal(byUnit.get("u1")?.pmDueTodayUnderwayCount, 1);
});
