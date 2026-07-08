import assert from "node:assert/strict";
import test from "node:test";

import { LogSubmissionStatus, MealType, UnitType } from "@prisma/client";

import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { pickDefaultMealTypeForUnitSlots } from "@/lib/servery-meal-service";
import { buildUnitWorkQueue } from "@/lib/unit-workspace/build-unit-work-queue";

/**
 * UNIT-009 — automated portion of PIN/floor regression.
 * Manual tablet checklist: docs/unit-workspace-pin-flow-checklist.md
 */

const UNIT_ID = "unit-kiosk-1";

test("PIN/kiosk staff default home is the locked unit workspace", () => {
  assert.equal(
    resolveDefaultHomePath({
      authKind: "employee",
      role: "STAFF",
      lockedUnitId: UNIT_ID,
      activeUnitId: "other-unit",
    }),
    `/unit/${UNIT_ID}`,
  );
  assert.equal(
    resolveDefaultHomePath({
      authKind: "employee",
      role: "STAFF",
      activeUnitId: UNIT_ID,
    }),
    `/unit/${UNIT_ID}`,
  );
});

test("log primary action is one hop to logs submit (≤3 taps total including land)", () => {
  const queue = buildUnitWorkQueue({
    unit: {
      id: UNIT_ID,
      name: "4A Servery",
      unitType: UnitType.SERVERY,
      isActive: true,
      mealTimes: [{ mealType: MealType.LUNCH, scheduledTime: "12:00" }],
    },
    activeLogTab: "service-log",
    now: new Date("2026-07-08T11:00:00"),
    mealServiceEventByMeal: new Map([
      [
        MealType.LUNCH,
        {
          mealType: MealType.LUNCH,
          mealServiceReadyAt: new Date("2026-07-08T10:45:00"),
          mealServiceStartedAt: new Date("2026-07-08T11:00:00"),
        },
      ],
    ]),
    queries: {
      assignments: [
        {
          id: "assign-temp",
          recurrence: "DAILY",
          mealType: MealType.LUNCH,
          timesPerDay: 1,
          template: { name: "Temp check", category: "Food Safety" },
        },
      ],
      submissions: [],
      openRepairs: [],
    },
  });

  assert.equal(queue.primaryItem?.kind, "pending-log");
  assert.equal(queue.primaryItem?.href, "/logs?tab=submit&assignmentId=assign-temp");
});

test("servery ready/started stay header-local (≤2 taps; no queue href required)", () => {
  const now = new Date("2026-07-08T11:00:00");
  const available: MealType[] = [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER];
  assert.equal(pickDefaultMealTypeForUnitSlots(available, now), MealType.LUNCH);

  const queue = buildUnitWorkQueue({
    unit: {
      id: UNIT_ID,
      name: "4A Servery",
      unitType: UnitType.SERVERY,
      isActive: true,
      mealTimes: available.map((mealType) => ({ mealType, scheduledTime: "12:00" })),
    },
    activeLogTab: "service-log",
    now,
    mealServiceEventByMeal: new Map(),
    queries: {
      assignments: [],
      submissions: [],
      openRepairs: [],
    },
  });

  assert.equal(queue.primaryItem?.kind, "servery-ready");
  assert.equal(queue.primaryItem?.href, null);
});

test("failed logs still beat servery milestones so floor does not skip compliance", () => {
  const queue = buildUnitWorkQueue({
    unit: {
      id: UNIT_ID,
      name: "4A Servery",
      unitType: UnitType.SERVERY,
      isActive: true,
      mealTimes: [{ mealType: MealType.LUNCH, scheduledTime: "12:00" }],
    },
    activeLogTab: "service-log",
    now: new Date("2026-07-08T11:00:00"),
    mealServiceEventByMeal: new Map(),
    queries: {
      assignments: [
        {
          id: "assign-temp",
          recurrence: "DAILY",
          mealType: MealType.LUNCH,
          timesPerDay: 1,
          template: { name: "Temp check", category: "Food Safety" },
        },
      ],
      submissions: [
        {
          id: "sub-fail",
          status: LogSubmissionStatus.FAILED,
          submittedAt: new Date("2026-07-08T10:00:00"),
          template: { name: "Temp check" },
          submittedBy: { displayName: "PIN User" },
        },
      ],
      openRepairs: [],
    },
  });

  assert.equal(queue.primaryItem?.kind, "failed-log");
  assert.match(queue.primaryItem?.href ?? "", /assignmentId=assign-temp/);
});
