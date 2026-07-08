import assert from "node:assert/strict";
import test from "node:test";

import { MealType, UnitType } from "@prisma/client";

import { resolveUnitOperationContext } from "@/lib/unit-workspace/resolve-unit-operation-context";

test("resolveUnitOperationContext uses unit meal slots and servery live state", () => {
  const context = resolveUnitOperationContext({
    now: new Date("2026-07-08T11:30:00"),
    unit: {
      id: "unit-1",
      name: "4A Servery",
      unitType: UnitType.SERVERY,
      isActive: true,
      mealTimes: [{ mealType: MealType.LUNCH, scheduledTime: "12:00" }],
    },
    mealServiceEventByMeal: new Map([
      [
        MealType.LUNCH,
        {
          mealType: MealType.LUNCH,
          mealServiceReadyAt: new Date("2026-07-08T11:00:00"),
          mealServiceStartedAt: null,
        },
      ],
    ]),
  });

  assert.equal(context.mealLabel, "Lunch");
  assert.equal(context.phase, "Execution");
  assert.equal(context.scheduledTimeLabel, "12:00 PM");
  assert.ok(context.minutesUntilService !== null && context.minutesUntilService > 0);
});

test("resolveUnitOperationContext defaults non-servery units to preparation", () => {
  const context = resolveUnitOperationContext({
    now: new Date("2026-07-08T08:00:00"),
    unit: {
      id: "unit-2",
      name: "Prep Kitchen",
      unitType: UnitType.KITCHEN,
      isActive: true,
      mealTimes: [],
    },
    mealServiceEventByMeal: new Map(),
  });

  assert.equal(context.phase, "Preparation");
  assert.equal(context.mealLabel, "Breakfast");
});
