import assert from "node:assert/strict";
import test from "node:test";

import { MealType, UnitType } from "@prisma/client";

import type { OperationsCenterMealBoard, OperationsCenterUnitCard } from "@/lib/operations-center";
import {
  mapOperationInstanceToActiveOperation,
  phaseFromOperationInstanceStatus,
  resolveMinutesUntilScheduledStart,
  resolveScheduledTimeLabel,
} from "@/lib/operations/map-operation-instance";
import { pickActiveOperationInstance } from "@/lib/operations/pick-active-operation-instance";
import { resolveHeuristicActiveOperation } from "@/lib/operations/resolve-heuristic-active-operation";
import { resolveActiveOperation } from "@/lib/operations/resolve-active-operation";
import type { ActiveOperationInstanceRow } from "@/lib/operations/types";

function withEnv(name: string, value: string | undefined, fn: () => void | Promise<void>) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }

  return Promise.resolve(fn()).finally(() => {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  });
}

function unitCard(partial: Partial<OperationsCenterUnitCard> & Pick<OperationsCenterUnitCard, "id" | "name">) {
  return {
    unitType: UnitType.SERVERY,
    hasDietary: true,
    expected: 0,
    completed: 0,
    failed: 0,
    missed: 0,
    pending: 0,
    mealTimes: [{ mealType: MealType.LUNCH, scheduledTime: "11:30" }],
    staffingCount: 1,
    openRepairCount: 0,
    ...partial,
  } satisfies OperationsCenterUnitCard;
}

function instanceRow(partial: Partial<ActiveOperationInstanceRow> & Pick<ActiveOperationInstanceRow, "id" | "label">) {
  const serviceDate = new Date("2026-07-08T00:00:00");
  return {
    definitionId: "def-1",
    facilityId: "facility-1",
    departmentId: "dept-dietary",
    serviceDate,
    mealType: MealType.LUNCH,
    status: "PREPARATION" as const,
    scheduledStartLocal: "11:30",
    scheduledEndLocal: "13:00",
    ...partial,
  } satisfies ActiveOperationInstanceRow;
}

const heuristicHints = {
  unitCards: [unitCard({ id: "servery", name: "4A Servery" })],
  mealBoards: [] as OperationsCenterMealBoard[],
};

test("resolveActiveOperation uses heuristic fallback when operation engine flag is off", async () => {
  await withEnv("OPERATION_ENGINE_ENABLED", undefined, async () => {
    const resolved = await resolveActiveOperation(
      {
        facilityId: "facility-1",
        departmentId: "dept-dietary",
        now: new Date("2026-07-08T12:00:00"),
        heuristicHints,
      },
      {
        findInstance: async () => {
          throw new Error("should not query OperationInstance when flag is off");
        },
      },
    );

    assert.equal(resolved.source, "heuristic");
    assert.equal(resolved.operationInstanceId, null);
    assert.equal(resolved.operationContext.mealType, MealType.LUNCH);
    assert.equal(resolved.operationContext.phase, "Preparation");
  });
});

test("resolveActiveOperation returns OperationInstance when flag is on and instance exists", async () => {
  const resolved = await resolveActiveOperation(
    {
      facilityId: "facility-1",
      departmentId: "dept-dietary",
      now: new Date("2026-07-08T12:00:00"),
      heuristicHints,
    },
    {
      isEngineEnabled: () => true,
      findInstance: async () =>
        instanceRow({
          id: "op-lunch",
          label: "Lunch",
          status: "EXECUTION",
        }),
    },
  );

  assert.equal(resolved.source, "operation_instance");
  assert.equal(resolved.operationInstanceId, "op-lunch");
  assert.equal(resolved.instanceStatus, "EXECUTION");
  assert.equal(resolved.operationContext.phase, "Execution");
  assert.equal(resolved.operationContext.mealLabel, "Lunch");
});

test("resolveActiveOperation falls back to heuristics when flag is on but no instance exists", async () => {
  const resolved = await resolveActiveOperation(
    {
      facilityId: "facility-1",
      departmentId: "dept-dietary",
      now: new Date("2026-07-08T12:00:00"),
      heuristicHints,
    },
    {
      isEngineEnabled: () => true,
      findInstance: async () => null,
    },
  );

  assert.equal(resolved.source, "heuristic");
  assert.equal(resolved.operationInstanceId, null);
  assert.equal(resolved.operationContext.mealType, MealType.LUNCH);
});

test("pickActiveOperationInstance prefers current meal and higher-priority status", () => {
  const picked = pickActiveOperationInstance(
    [
      instanceRow({ id: "breakfast", label: "Breakfast", mealType: MealType.BREAKFAST, status: "SCHEDULED" }),
      instanceRow({ id: "lunch-prep", label: "Lunch", mealType: MealType.LUNCH, status: "PREPARATION" }),
      instanceRow({ id: "lunch-live", label: "Lunch", mealType: MealType.LUNCH, status: "EXECUTION" }),
    ],
    MealType.LUNCH,
  );

  assert.equal(picked?.id, "lunch-live");
});

test("pickActiveOperationInstance ignores terminal statuses", () => {
  const picked = pickActiveOperationInstance(
    [
      instanceRow({ id: "done", label: "Breakfast", mealType: MealType.BREAKFAST, status: "COMPLETED" }),
      instanceRow({ id: "cancelled", label: "Dinner", mealType: MealType.DINNER, status: "CANCELLED" }),
    ],
    MealType.BREAKFAST,
  );

  assert.equal(picked, null);
});

test("mapOperationInstanceToActiveOperation handles non-meal labels and invalid schedule hints", () => {
  const now = new Date("2026-07-08T08:00:00");
  const resolved = mapOperationInstanceToActiveOperation(
    instanceRow({
      id: "evs-round",
      label: "Morning EVS round",
      mealType: null,
      status: "PREPARATION",
      scheduledStartLocal: "invalid",
    }),
    now,
  );

  assert.equal(resolved.operationContext.mealLabel, "Morning EVS round");
  assert.equal(resolved.operationContext.serviceLabel, "Morning EVS round");
  assert.equal(resolved.operationContext.scheduledTimeLabel, "invalid");
  assert.equal(resolved.operationContext.minutesUntilService, null);
  assert.equal(phaseFromOperationInstanceStatus("EXECUTION"), "Execution");
  assert.match(resolveScheduledTimeLabel("07:15", now) ?? "", /7:15/);
  assert.equal(resolveMinutesUntilScheduledStart("07:15", now), -45);
});

test("resolveHeuristicActiveOperation uses time-of-day fallback without dashboard hints", () => {
  const resolved = resolveHeuristicActiveOperation({
    facilityId: "facility-1",
    departmentId: "dept-dietary",
    now: new Date("2026-07-08T06:30:00"),
  });

  assert.equal(resolved.source, "heuristic");
  assert.equal(resolved.operationContext.mealType, MealType.BREAKFAST);
  assert.equal(resolved.operationContext.phase, "Preparation");
  assert.equal(resolved.operationContext.scheduledTimeLabel, null);
});
