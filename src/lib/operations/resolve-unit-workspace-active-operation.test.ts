import assert from "node:assert/strict";
import test from "node:test";

import { MealType, UnitType } from "@prisma/client";

import {
  legacyOperationsCenterDepartmentId,
} from "@/lib/operations/resolve-operations-center-active-operation";
import { resolveUnitWorkspaceActiveOperation } from "@/lib/operations/resolve-unit-workspace-active-operation";

const unit = {
  id: "unit-1",
  name: "4A Servery",
  unitType: UnitType.SERVERY,
  isActive: true,
  mealTimes: [{ mealType: MealType.LUNCH, scheduledTime: "12:00" }],
};

const mealServiceEventByMeal = new Map([
  [
    MealType.LUNCH,
    {
      mealType: MealType.LUNCH,
      mealServiceReadyAt: new Date("2026-07-08T11:00:00"),
      mealServiceStartedAt: null,
    },
  ],
] as const);

const prismaStub = {
  operationDefinition: {
    findFirst: async () => null,
  },
} as never;

test("resolveUnitWorkspaceActiveOperation uses unit heuristics when engine flag is off", async () => {
  const resolved = await resolveUnitWorkspaceActiveOperation(
    prismaStub,
    {
      facilityId: "facility-1",
      unit,
      mealServiceEventByMeal,
      now: new Date("2026-07-08T11:30:00"),
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
  assert.equal(resolved.operationContext.phase, "Execution");
});

function operationPrismaStub(overrides: { departmentId?: string | null } = {}) {
  return {
    operationDefinition: {
      findFirst: async () =>
        overrides.departmentId === null
          ? null
          : { departmentId: overrides.departmentId ?? "dept-dietary" },
    },
    operationInstance: {
      findMany: async () => [],
    },
  } as never;
}

test("resolveUnitWorkspaceActiveOperation uses OperationInstance when engine flag is on", async () => {
  const resolved = await resolveUnitWorkspaceActiveOperation(
    operationPrismaStub(),
    {
      facilityId: "facility-1",
      unit,
      mealServiceEventByMeal,
      now: new Date("2026-07-08T11:30:00"),
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
        scheduledStartLocal: "12:00",
        scheduledEndLocal: "13:30",
      }),
    },
  );

  assert.equal(resolved.source, "operation_instance");
  assert.equal(resolved.operationInstanceId, "op-lunch");
  assert.equal(resolved.operationContext.phase, "Execution");
  assert.equal(resolved.operationContext.serviceLabel, "Lunch service");
});

test("resolveUnitWorkspaceActiveOperation falls back to unit heuristics when no instance exists", async () => {
  const resolved = await resolveUnitWorkspaceActiveOperation(
    operationPrismaStub(),
    {
      facilityId: "facility-1",
      unit,
      mealServiceEventByMeal,
      now: new Date("2026-07-08T11:30:00"),
    },
    {
      isEngineEnabled: () => true,
      findInstance: async () => null,
    },
  );

  assert.equal(resolved.source, "heuristic");
  assert.equal(resolved.operationInstanceId, null);
  assert.equal(resolved.operationContext.mealType, MealType.LUNCH);
  assert.equal(resolved.operationContext.phase, "Execution");
});

test("resolveUnitWorkspaceActiveOperation falls back when operation prisma delegates are missing", async () => {
  const resolved = await resolveUnitWorkspaceActiveOperation(
    {} as never,
    {
      facilityId: "facility-1",
      unit,
      mealServiceEventByMeal,
      now: new Date("2026-07-08T11:30:00"),
    },
    {
      isEngineEnabled: () => true,
      findInstance: async () => {
        throw new Error("should not query instances when prisma delegates are missing");
      },
    },
  );

  assert.equal(resolved.source, "heuristic");
  assert.equal(resolved.departmentId, legacyOperationsCenterDepartmentId("facility-1"));
  assert.equal(resolved.operationContext.mealType, MealType.LUNCH);
});

test("resolveHeuristicActiveOperation prefers unit hints over dashboard hints", async () => {
  const { resolveHeuristicActiveOperation } = await import(
    "@/lib/operations/resolve-heuristic-active-operation"
  );

  const resolved = resolveHeuristicActiveOperation({
    facilityId: "facility-1",
    departmentId: "dept-dietary",
    now: new Date("2026-07-08T11:30:00"),
    unitHeuristicHints: {
      unit,
      mealServiceEventByMeal,
    },
    heuristicHints: {
      unitCards: [
        {
          id: "other",
          name: "Other Servery",
          unitType: UnitType.SERVERY,
          hasDietary: true,
          expected: 0,
          completed: 0,
          failed: 0,
          missed: 0,
          pending: 0,
          mealTimes: [{ mealType: MealType.BREAKFAST, scheduledTime: "07:30" }],
          staffingCount: 1,
          openRepairCount: 0,
        },
      ],
      mealBoards: [],
    },
  });

  assert.equal(resolved.operationContext.mealType, MealType.LUNCH);
  assert.equal(resolved.operationContext.phase, "Execution");
});
