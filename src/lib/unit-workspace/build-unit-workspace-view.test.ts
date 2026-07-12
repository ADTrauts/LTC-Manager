import assert from "node:assert/strict";
import test from "node:test";

import { LogSubmissionStatus, MealType, UnitType } from "@prisma/client";

import { buildUnitWorkspaceView } from "@/lib/unit-workspace/build-unit-workspace-view";

const unit = {
  id: "unit-1",
  name: "4A Servery",
  unitType: UnitType.SERVERY,
  isActive: true,
  mealTimes: [{ mealType: MealType.BREAKFAST, scheduledTime: "07:30" }],
};

test("buildUnitWorkspaceView computes log totals and staffing coverage", () => {
  const view = buildUnitWorkspaceView({
    unit,
    facilityId: "fac-1",
    search: {},
    now: new Date("2026-07-08T08:00:00"),
    queries: {
      assignments: [
        {
          id: "a1",
          recurrence: "DAILY",
          mealType: MealType.BREAKFAST,
          timesPerDay: 2,
          template: { name: "Temp check", category: "Food Safety" },
        },
      ],
      submissions: [
        {
          id: "s1",
          assignmentId: "a1",
          status: LogSubmissionStatus.COMPLETED,
          submittedAt: new Date("2026-07-08T08:00:00"),
          mealType: MealType.BREAKFAST,
          template: { name: "Temp check" },
          submittedBy: { displayName: "Alex" },
        },
        {
          id: "s2",
          assignmentId: "a1",
          status: LogSubmissionStatus.FAILED,
          submittedAt: new Date("2026-07-08T09:00:00"),
          mealType: MealType.BREAKFAST,
          template: { name: "Temp check" },
          submittedBy: { displayName: "Alex" },
        },
      ],
      schedulesToday: [{ id: "sch-1" } as never],
      overridesToday: [
        { oldUnitId: "unit-1", newUnitId: "unit-2" } as never,
        { oldUnitId: "unit-2", newUnitId: "unit-1" } as never,
      ],
      openRepairs: [],
      mealServiceEventsToday: [
        {
          mealType: MealType.BREAKFAST,
          mealServiceReadyAt: new Date("2026-07-08T07:15:00"),
          mealServiceStartedAt: null,
        },
      ],
      mealServiceHistory: [],
      logHistory: [],
      roomAreaStatusToday: null,
      outOfServiceAssets: [],
      pmSchedulesDueThroughToday: [],
      menuData: {
        settingsRaw: null,
        menuItems: [],
        unavailableReason: null,
      },
      inspectionDefinitions: [],
      inspectionHistory: [],
    },
  });

  assert.equal(view.expected, 2);
  assert.equal(view.completed, 1);
  assert.equal(view.failed, 1);
  assert.equal(view.pending, 0);
  assert.equal(view.readiness.state, "blocked");
  assert.equal(view.movedOut, 1);
  assert.equal(view.movedIn, 1);
  assert.equal(view.effectiveCoverage, 1);
  assert.equal(view.activeUnitTab, "overview");
  assert.equal(view.logTabs[0]?.key, "service-log");
  assert.equal(view.mealServiceEventByMeal.get(MealType.BREAKFAST)?.mealServiceReadyAt?.getTime(), new Date("2026-07-08T07:15:00").getTime());
  assert.equal(view.operationContext.mealLabel, "Breakfast");
  assert.ok(view.workQueue.operationalCount > 0);
});

test("buildUnitWorkspaceView resolves log tab and meal service flash message", () => {
  const view = buildUnitWorkspaceView({
    unit,
    facilityId: "fac-1",
    search: { unitTab: "logs", logTab: "food-safety", mealServiceEvent: "ready-recorded" },
    now: new Date("2026-07-08T08:00:00"),
    queries: {
      assignments: [
        {
          id: "a1",
          recurrence: "DAILY",
          mealType: MealType.BREAKFAST,
          timesPerDay: 1,
          template: { name: "Sanitizer", category: "Food Safety" },
        },
      ],
      submissions: [],
      schedulesToday: [{ id: "sch-1" } as never],
      overridesToday: [],
      openRepairs: [],
      mealServiceEventsToday: [],
      mealServiceHistory: [],
      logHistory: [
        {
          id: "h1",
          submittedAt: new Date("2026-07-07T12:00:00"),
          status: LogSubmissionStatus.COMPLETED,
          template: { name: "Sanitizer", category: "Food Safety" },
          submittedBy: { displayName: "Sam" },
        },
      ],
      roomAreaStatusToday: null,
      outOfServiceAssets: [],
      pmSchedulesDueThroughToday: [],
      menuData: {
        settingsRaw: null,
        menuItems: [],
        unavailableReason: null,
      },
      inspectionDefinitions: [
        {
          id: "insp-1",
          name: "Room walk",
          description: null,
          frequency: "Daily",
          facilityId: "fac-1",
          departmentId: null,
          unitId: "unit-1",
          isActive: true,
          _count: { items: 3 },
        },
        {
          id: "insp-other",
          name: "Other unit only",
          description: null,
          frequency: null,
          facilityId: "fac-1",
          departmentId: null,
          unitId: "unit-9",
          isActive: true,
          _count: { items: 1 },
        },
        {
          id: "insp-inactive",
          name: "Inactive",
          description: null,
          frequency: null,
          facilityId: "fac-1",
          departmentId: null,
          unitId: null,
          isActive: false,
          _count: { items: 1 },
        },
      ],
      inspectionHistory: [
        {
          id: "sub-1",
          result: "PASSED",
          submittedAt: new Date("2026-07-08T07:00:00"),
          definition: { name: "Room walk" },
          submittedByEmployee: { firstName: "Pat", lastName: "Lee" },
        },
      ],
    },
  });

  assert.equal(view.activeUnitTab, "logs");
  assert.equal(view.activeLogTab, "food-safety");
  assert.equal(view.selectedLogCategory, "Food Safety");
  assert.equal(view.selectedLogHistory.length, 1);
  assert.equal(view.mealServiceEventMessage, "Meal service ready time saved.");
  assert.equal(view.readiness.state, "in_progress");
  assert.match(view.readiness.reason, /in progress|due now|setup/i);
  assert.equal(view.availableInspections.length, 1);
  assert.equal(view.availableInspections[0]?.id, "insp-1");
  assert.equal(view.inspectionHistory.length, 1);
  assert.ok(view.workQueue.items.some((item) => item.kind === "available-inspection"));
});
