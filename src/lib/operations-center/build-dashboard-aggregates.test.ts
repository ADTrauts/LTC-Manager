import assert from "node:assert/strict";
import test from "node:test";

import { LogSubmissionStatus, MealType, UnitType } from "@prisma/client";

import { buildDashboardAggregates } from "@/lib/operations-center/build-dashboard-aggregates";

test("buildDashboardAggregates computes unit log and staffing totals", () => {
  const now = new Date("2026-07-08T12:00:00");
  const data = buildDashboardAggregates({
    month: 7,
    managerCount: 1,
    birthdaysThisMonth: [],
    units: [
      {
        id: "unit-1",
        name: "4A Servery",
        unitType: UnitType.SERVERY,
        mealTimes: [{ mealType: MealType.BREAKFAST, scheduledTime: "07:30" }],
        departmentResponsibilities: [{ department: { key: "DIETARY" } }],
      },
    ],
    assignments: [
      {
        id: "a1",
        unitId: "unit-1",
        templateId: "t1",
        mealType: MealType.BREAKFAST,
        timesPerDay: 2,
        template: { name: "Temp check" },
      },
    ],
    submissionsToday: [
      {
        id: "s1",
        assignmentId: "a1",
        unitId: "unit-1",
        status: LogSubmissionStatus.COMPLETED,
        mealType: MealType.BREAKFAST,
      },
      {
        id: "s2",
        assignmentId: "a1",
        unitId: "unit-1",
        status: LogSubmissionStatus.FAILED,
        mealType: MealType.BREAKFAST,
      },
    ],
    scheduleEntriesToday: [],
    overridesToday: [],
    openRepairs: [{ id: "r1", unitId: "unit-1", priority: "URGENT" }],
    serveryMealServiceEventsToday: [],
    roomAreaStatusesToday: [],
    now,
  });

  assert.equal(data.unitCards[0]?.expected, 2);
  assert.equal(data.unitCards[0]?.completed, 1);
  assert.equal(data.unitCards[0]?.failed, 1);
  assert.equal(data.unitCards[0]?.pending, 0);
  assert.equal(data.unitCards[0]?.staffingCount, 0);
  assert.equal(data.unitCards[0]?.openRepairCount, 1);
  assert.equal(data.totals.expected, 2);
  assert.equal(data.unitsWithExceptions.length, 1);
  assert.equal(data.openRepairCount, 1);
  assert.equal(data.urgentRepairCount, 1);
  assert.ok(data.operationContext.serviceLabel.length > 0);
  assert.ok(data.sitePulse.headline.length > 0);
});
