import assert from "node:assert/strict";
import test from "node:test";

import { MealType, ShiftType } from "@prisma/client";

import {
  isStaffingOverrideInScope,
  isStaffingScheduleInScope,
  resolveStaffingMealScope,
  scopeStaffingQueries,
} from "@/lib/operations/scope-staffing-queries";
import type { ResolvedActiveOperation } from "@/lib/operations/types";

const schedules = [
  { unitId: "unit-1", shift: ShiftType.BREAKFAST },
  { unitId: "unit-1", shift: ShiftType.LUNCH },
  { unitId: "unit-1", shift: ShiftType.FULL_DAY },
];

const overrides = [
  { oldUnitId: "unit-1", newUnitId: "unit-2", mealType: MealType.BREAKFAST },
  { oldUnitId: "unit-2", newUnitId: "unit-1", mealType: null },
  { oldUnitId: null, newUnitId: "unit-1", mealType: MealType.LUNCH },
];

function lunchInstanceOperation(): Pick<ResolvedActiveOperation, "source" | "operationContext"> {
  return {
    source: "operation_instance",
    operationContext: {
      mealType: MealType.LUNCH,
      mealLabel: "Lunch",
      serviceLabel: "Lunch service",
      phase: "Execution",
      scheduledTimeLabel: "12:00 PM",
      minutesUntilService: 15,
    },
  };
}

function evsInstanceOperation(): Pick<ResolvedActiveOperation, "source" | "operationContext"> {
  return {
    source: "operation_instance",
    operationContext: {
      mealType: MealType.BREAKFAST,
      mealLabel: "Morning EVS round",
      serviceLabel: "Morning EVS round",
      phase: "Preparation",
      scheduledTimeLabel: null,
      minutesUntilService: null,
    },
  };
}

test("resolveStaffingMealScope returns undefined when operation engine flag is off", () => {
  assert.equal(resolveStaffingMealScope(lunchInstanceOperation(), false), undefined);
});

test("scopeStaffingQueries leaves rows unchanged when operation engine flag is off", () => {
  const scoped = scopeStaffingQueries({
    schedules,
    overrides,
    activeOperation: lunchInstanceOperation(),
    engineEnabled: false,
  });

  assert.equal(scoped.schedules.length, schedules.length);
  assert.equal(scoped.overrides.length, overrides.length);
});

test("scopeStaffingQueries narrows schedules and overrides to active meal instance", () => {
  const scoped = scopeStaffingQueries({
    schedules,
    overrides,
    activeOperation: lunchInstanceOperation(),
    engineEnabled: true,
  });

  assert.deepEqual(
    scoped.schedules.map((entry) => entry.shift),
    [ShiftType.LUNCH, ShiftType.FULL_DAY],
  );
  assert.deepEqual(
    scoped.overrides.map((override) => override.mealType ?? null),
    [null, MealType.LUNCH],
  );
});

test("scopeStaffingQueries falls back when no operation instance is active", () => {
  const scoped = scopeStaffingQueries({
    schedules,
    overrides,
    activeOperation: {
      source: "heuristic",
      operationContext: lunchInstanceOperation().operationContext,
    },
    engineEnabled: true,
  });

  assert.equal(scoped.schedules.length, schedules.length);
  assert.equal(scoped.overrides.length, overrides.length);
});

test("scopeStaffingQueries does not narrow for non-meal operation instances", () => {
  const scoped = scopeStaffingQueries({
    schedules,
    overrides,
    activeOperation: evsInstanceOperation(),
    engineEnabled: true,
  });

  assert.equal(scoped.schedules.length, schedules.length);
  assert.equal(scoped.overrides.length, overrides.length);
});

test("isStaffingScheduleInScope keeps full-day shifts when meal scoped", () => {
  assert.equal(isStaffingScheduleInScope({ shift: ShiftType.FULL_DAY }, MealType.LUNCH), true);
  assert.equal(isStaffingScheduleInScope({ shift: ShiftType.BREAKFAST }, MealType.LUNCH), false);
});

test("isStaffingOverrideInScope keeps meal-agnostic overrides when scoped", () => {
  assert.equal(isStaffingOverrideInScope({ mealType: null }, MealType.LUNCH), true);
  assert.equal(isStaffingOverrideInScope({ mealType: MealType.BREAKFAST }, MealType.LUNCH), false);
});
