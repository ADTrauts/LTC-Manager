import type { MealType } from "@prisma/client";
import { UnitType } from "@prisma/client";

import type { OperationContext } from "@/lib/operations-center";
import { computeUnitReadiness } from "@/lib/readiness";
import type { UnitReadiness } from "@/lib/readiness/types";
import { isWithinServeryLiveWindow } from "@/lib/servery-meal-service";

import type { UnitQueryResult } from "./load-unit-queries";
import type { UnitWorkspaceMealServiceEventToday, UnitWorkspaceUnit } from "./types";

function resolveServeryMealNotLive(input: {
  unit: UnitWorkspaceUnit;
  operationContext: OperationContext;
  mealServiceEventByMeal: Map<MealType, UnitWorkspaceMealServiceEventToday>;
  now: Date;
}): boolean {
  if (input.unit.unitType !== UnitType.SERVERY || input.operationContext.phase !== "Execution") {
    return false;
  }

  const event = input.mealServiceEventByMeal.get(input.operationContext.mealType);
  if (!event) {
    return true;
  }

  const readyLive = event.mealServiceReadyAt
    ? isWithinServeryLiveWindow(event.mealServiceReadyAt, input.now)
    : false;
  const startedLive = event.mealServiceStartedAt
    ? isWithinServeryLiveWindow(event.mealServiceStartedAt, input.now)
    : false;

  return !readyLive && !startedLive;
}

export function computeUnitWorkspaceReadiness(input: {
  unit: UnitWorkspaceUnit;
  queries: Pick<UnitQueryResult, "openRepairs">;
  mealServiceEventByMeal: Map<MealType, UnitWorkspaceMealServiceEventToday>;
  operationContext: OperationContext;
  failed: number;
  missed: number;
  pending: number;
  expected: number;
  completed: number;
  effectiveCoverage: number;
  now: Date;
}): UnitReadiness {
  const urgentRepairCount = input.queries.openRepairs.filter((repair) => repair.priority === "URGENT").length;
  const highRepairCount = input.queries.openRepairs.filter((repair) => repair.priority === "HIGH").length;

  return computeUnitReadiness({
    unitId: input.unit.id,
    unitName: input.unit.name,
    unitType: input.unit.unitType,
    failed: input.failed,
    missed: input.missed,
    pending: input.pending,
    expected: input.expected,
    completed: input.completed,
    staffingCount: input.effectiveCoverage,
    openRepairCount: input.queries.openRepairs.length,
    urgentRepairCount,
    highRepairCount,
    serveryMealNotLive: resolveServeryMealNotLive(input),
    operationPhase: input.operationContext.phase,
  });
}
