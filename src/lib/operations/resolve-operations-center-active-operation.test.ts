import assert from "node:assert/strict";
import test from "node:test";

import { MealType, UnitType } from "@prisma/client";

import {
  legacyOperationsCenterDepartmentId,
  resolveOperationsCenterActiveOperation,
} from "@/lib/operations/resolve-operations-center-active-operation";

const heuristicHints = {
  unitCards: [
    {
      id: "servery",
      name: "4A Servery",
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
    },
  ],
  mealBoards: [],
};

const prismaStub = {
  operationDefinition: {
    findFirst: async () => null,
  },
} as never;

test("resolveOperationsCenterActiveOperation uses heuristic context when engine flag is off", async () => {
  const resolved = await resolveOperationsCenterActiveOperation(
    prismaStub,
    {
      facilityId: "facility-1",
      now: new Date("2026-07-08T12:00:00"),
      ...heuristicHints,
    },
    {
      isEngineEnabled: () => false,
      findInstance: async () => {
        throw new Error("should not query instances when flag is off");
      },
    },
  );

  assert.equal(resolved.source, "heuristic");
  assert.equal(resolved.departmentId, legacyOperationsCenterDepartmentId("facility-1"));
  assert.equal(resolved.operationContext.mealType, MealType.LUNCH);
  assert.equal(resolved.operationContext.phase, "Preparation");
});

test("resolveOperationsCenterActiveOperation uses OperationInstance when engine flag is on", async () => {
  const resolved = await resolveOperationsCenterActiveOperation(
    {
      operationDefinition: {
        findFirst: async () => ({ departmentId: "dept-dietary" }),
      },
    } as never,
    {
      facilityId: "facility-1",
      now: new Date("2026-07-08T12:00:00"),
      ...heuristicHints,
    },
    {
      isEngineEnabled: () => true,
      findInstance: async () => ({
        id: "op-lunch",
        definitionId: "def-lunch",
        facilityId: "facility-1",
        departmentId: "dept-dietary",
        serviceDate: new Date("2026-07-08T00:00:00"),
        mealType: MealType.LUNCH,
        label: "Lunch",
        status: "EXECUTION",
        scheduledStartLocal: "11:30",
        scheduledEndLocal: "13:00",
      }),
    },
  );

  assert.equal(resolved.source, "operation_instance");
  assert.equal(resolved.operationInstanceId, "op-lunch");
  assert.equal(resolved.operationContext.phase, "Execution");
  assert.equal(resolved.operationContext.serviceLabel, "Lunch service");
});

test("resolveOperationsCenterActiveOperation falls back to heuristics when no instance exists", async () => {
  const resolved = await resolveOperationsCenterActiveOperation(
    {
      operationDefinition: {
        findFirst: async () => ({ departmentId: "dept-dietary" }),
      },
    } as never,
    {
      facilityId: "facility-1",
      now: new Date("2026-07-08T12:00:00"),
      ...heuristicHints,
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
