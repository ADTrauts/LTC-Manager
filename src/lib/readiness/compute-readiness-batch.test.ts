import assert from "node:assert/strict";
import test from "node:test";

import { LogSubmissionStatus, MealType, UnitType } from "@prisma/client";

import { computeReadinessBatch } from "@/lib/readiness/compute-readiness-batch";
import { computeUnitReadiness } from "@/lib/readiness/compute-unit-readiness";

test("computeUnitReadiness returns ready when no signals are raised", () => {
  const readiness = computeUnitReadiness({
    unitId: "ready",
    unitName: "Gift Shop",
    unitType: UnitType.RETAIL,
    failed: 0,
    missed: 0,
    pending: 0,
    expected: 1,
    completed: 1,
    staffingCount: 1,
    openRepairCount: 0,
    urgentRepairCount: 0,
    highRepairCount: 0,
    serveryMealNotLive: false,
    operationPhase: "Preparation",
  });

  assert.equal(readiness.state, "ready");
  assert.equal(readiness.reasonCodes.length, 0);
});

test("computeReadinessBatch computes all active units in one pass", () => {
  const now = new Date("2026-07-08T12:00:00");
  const batch = computeReadinessBatch({
    month: 7,
    managerCount: 1,
    birthdaysThisMonth: [],
    units: [
      {
        id: "blocked",
        name: "West Servery",
        unitType: UnitType.SERVERY,
        mealTimes: [{ mealType: MealType.LUNCH, scheduledTime: "11:30" }],
        departmentResponsibilities: [{ department: { key: "DIETARY" } }],
      },
      {
        id: "ready",
        name: "Gift Shop",
        unitType: UnitType.RETAIL,
        mealTimes: [],
        departmentResponsibilities: [],
      },
    ],
    assignments: [
      {
        id: "a1",
        unitId: "blocked",
        templateId: "t1",
        mealType: MealType.LUNCH,
        timesPerDay: 1,
        template: { name: "Temp check" },
      },
    ],
    submissionsToday: [
      {
        id: "s1",
        assignmentId: "a1",
        unitId: "blocked",
        status: LogSubmissionStatus.FAILED,
        mealType: MealType.LUNCH,
      },
    ],
    scheduleEntriesToday: [],
    overridesToday: [],
    openRepairs: [{ id: "r1", unitId: "blocked", priority: "URGENT" }],
    serveryMealServiceEventsToday: [],
    now,
  });

  assert.equal(batch.items.length, 2);
  assert.equal(batch.byUnitId.get("blocked")?.state, "blocked");
  assert.equal(batch.byUnitId.get("ready")?.state, "ready");
  assert.equal(batch.summary.blocked, 1);
  assert.equal(batch.summary.ready, 1);
  assert.ok(batch.operationContext.serviceLabel.length > 0);
});

test("computeReadinessBatch exposes O(1) lookup map for sidebar consumers", () => {
  const now = new Date("2026-07-08T08:00:00");
  const batch = computeReadinessBatch({
    month: 7,
    managerCount: 0,
    birthdaysThisMonth: [],
    units: [
      {
        id: "kitchen",
        name: "Main Kitchen",
        unitType: UnitType.KITCHEN,
        mealTimes: [],
        departmentResponsibilities: [{ department: { key: "DIETARY" } }],
      },
    ],
    assignments: [],
    submissionsToday: [],
    scheduleEntriesToday: [],
    overridesToday: [],
    openRepairs: [],
    serveryMealServiceEventsToday: [],
    now,
  });

  assert.equal(batch.byUnitId.get("kitchen")?.state, "blocked");
  assert.match(batch.byUnitId.get("kitchen")?.reason ?? "", /staff assigned/i);
});
