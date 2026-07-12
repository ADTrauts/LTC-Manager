import assert from "node:assert/strict";
import test from "node:test";

import { LogSubmissionStatus, MealType, RepairPriority, UnitType } from "@prisma/client";

import { buildUnitWorkQueue } from "@/lib/unit-workspace/build-unit-work-queue";
import { UNIT_WORK_QUEUE_PRIORITY } from "@/lib/unit-workspace/work-queue-priority";

const serveryUnit = {
  id: "unit-1",
  name: "4A Servery",
  unitType: UnitType.SERVERY,
  isActive: true,
  mealTimes: [
    { mealType: MealType.BREAKFAST, scheduledTime: "07:30" },
    { mealType: MealType.LUNCH, scheduledTime: "12:00" },
  ],
};

test("buildUnitWorkQueue prioritizes failed logs before pending logs and repairs", () => {
  const queue = buildUnitWorkQueue({
    unit: serveryUnit,
    activeLogTab: "service-log",
    now: new Date("2026-07-08T11:00:00"),
    mealServiceEventByMeal: new Map(),
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
          status: LogSubmissionStatus.FAILED,
          submittedAt: new Date("2026-07-08T08:00:00"),
          template: { name: "Temp check" },
          submittedBy: { displayName: "Alex" },
        },
      ],
      openRepairs: [
        {
          id: "r1",
          repairCode: "R-100",
          title: "Warmer down",
          priority: RepairPriority.URGENT,
          status: "OPEN",
          issueType: "EQUIPMENT",
          workOrderKind: "CORRECTIVE",
          assignedEmployeeId: null,
          dueAt: null,
          preventiveScheduleId: null,
          assetId: null,
        },
      ],
    },
  });

  assert.equal(queue.primaryItem?.kind, "failed-log");
  assert.ok(queue.items[0]!.priority < queue.items.find((item) => item.kind === "urgent-repair")!.priority);
  assert.ok(queue.items.some((item) => item.kind === "pending-log"));
  assert.ok(queue.items.some((item) => item.kind === "servery-ready"));
});

test("buildUnitWorkQueue returns calm operational empty state when no work is due", () => {
  const queue = buildUnitWorkQueue({
    unit: {
      id: "unit-2",
      name: "Prep Kitchen",
      unitType: UnitType.KITCHEN,
      isActive: true,
      mealTimes: [],
    },
    activeLogTab: null,
    now: new Date("2026-07-08T11:00:00"),
    mealServiceEventByMeal: new Map(),
    queries: {
      assignments: [],
      submissions: [],
      openRepairs: [],
    },
  });

  assert.equal(queue.operationalCount, 0);
  assert.equal(queue.primaryItem, null);
  assert.equal(queue.items.every((item) => item.priority === UNIT_WORK_QUEUE_PRIORITY.SECONDARY), true);
});

test("buildUnitWorkQueue promotes servery started after ready is recorded", () => {
  const queue = buildUnitWorkQueue({
    unit: serveryUnit,
    activeLogTab: "service-log",
    now: new Date("2026-07-08T11:00:00"),
    mealServiceEventByMeal: new Map([
      [
        MealType.LUNCH,
        {
          mealType: MealType.LUNCH,
          mealServiceReadyAt: new Date("2026-07-08T11:15:00"),
          mealServiceStartedAt: null,
        },
      ],
    ]),
    queries: {
      assignments: [],
      submissions: [],
      openRepairs: [],
    },
  });

  assert.equal(queue.primaryItem?.kind, "servery-started");
  assert.match(queue.primaryItem?.title ?? "", /Lunch/i);
});
