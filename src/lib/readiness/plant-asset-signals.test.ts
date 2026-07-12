import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPmScheduleSignals,
  emptyPlantUnitSignals,
  groupOutOfServiceAssetsByUnit,
} from "@/lib/readiness/plant-asset-signals";
import { normalizeAssetCriticality } from "@/lib/asset-criticality";

test("normalizeAssetCriticality defaults unknown values to ROUTINE", () => {
  assert.equal(normalizeAssetCriticality(undefined), "ROUTINE");
  assert.equal(normalizeAssetCriticality("CRITICAL"), "CRITICAL");
});

test("groupOutOfServiceAssetsByUnit ranks CRITICAL vs ROUTINE", () => {
  const map = groupOutOfServiceAssetsByUnit([
    { id: "1", unitId: "u1", name: "Cooler", status: "OUT_OF_SERVICE", criticality: "CRITICAL" },
    { id: "2", unitId: "u1", name: "Lamp", status: "OUT_OF_SERVICE", criticality: "ROUTINE" },
    { id: "3", unitId: "u1", name: "Oven", status: "ACTIVE", criticality: "CRITICAL" },
  ]);
  assert.equal(map.get("u1")?.criticalOutOfServiceCount, 1);
  assert.equal(map.get("u1")?.routineOutOfServiceCount, 1);
  assert.equal(map.get("u1")?.primaryCriticalOutOfServiceName, "Cooler");
});

test("IMPORTANT out-of-service is addressed when repair is assigned", () => {
  const map = groupOutOfServiceAssetsByUnit(
    [{ id: "a1", unitId: "u1", name: "Hot well", status: "OUT_OF_SERVICE", criticality: "IMPORTANT" }],
    [
      {
        id: "r1",
        unitId: "u1",
        assetId: "a1",
        priority: "MEDIUM",
        status: "IN_PROGRESS",
        assignedEmployeeId: "e1",
        dueAt: null,
      },
    ],
    new Date("2026-07-12T12:00:00Z"),
  );
  assert.equal(map.get("u1")?.importantOutOfServiceAddressedCount, 1);
  assert.equal(map.get("u1")?.importantOutOfServiceUnaddressedCount, 0);
});

test("IMPORTANT out-of-service is unaddressed when significant repair is overdue and unassigned", () => {
  const map = groupOutOfServiceAssetsByUnit(
    [{ id: "a1", unitId: "u1", name: "Hot well", status: "OUT_OF_SERVICE", criticality: "IMPORTANT" }],
    [
      {
        id: "r1",
        unitId: "u1",
        assetId: "a1",
        priority: "HIGH",
        status: "OPEN",
        assignedEmployeeId: null,
        dueAt: new Date("2026-07-11T12:00:00Z"),
      },
    ],
    new Date("2026-07-12T12:00:00Z"),
  );
  assert.equal(map.get("u1")?.importantOutOfServiceUnaddressedCount, 1);
});

test("applyPmScheduleSignals only escalates overdue CRITICAL PM", () => {
  const now = new Date("2026-07-08T15:00:00Z");
  const byUnit = new Map([["u1", emptyPlantUnitSignals()]]);
  applyPmScheduleSignals({
    byUnit,
    now,
    underwayScheduleIds: new Set(["pm-due"]),
    schedules: [
      {
        id: "pm-overdue-critical",
        name: "Boiler inspection",
        nextDueAt: new Date("2026-07-07T12:00:00Z"),
        asset: { unitId: "u1", name: "Boiler", status: "ACTIVE", criticality: "CRITICAL" },
      },
      {
        id: "pm-overdue-routine",
        name: "Filter wipe",
        nextDueAt: new Date("2026-07-07T12:00:00Z"),
        asset: { unitId: "u1", name: "Fan", status: "ACTIVE", criticality: "ROUTINE" },
      },
      {
        id: "pm-due",
        name: "Filter change",
        nextDueAt: new Date("2026-07-08T18:00:00Z"),
        asset: { unitId: "u1", name: "AHU", status: "ACTIVE", criticality: "IMPORTANT" },
      },
    ],
  });
  assert.equal(byUnit.get("u1")?.overdueCriticalPmCount, 1);
  assert.equal(byUnit.get("u1")?.overdueRoutinePmCount, 1);
  assert.equal(byUnit.get("u1")?.dueTodayPmScheduleCount, 1);
  assert.equal(byUnit.get("u1")?.pmDueTodayUnderwayElevatedCount, 1);
});
