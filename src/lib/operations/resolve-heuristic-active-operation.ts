import { fmtMealLabel } from "@/lib/operations-center/fmt-meal-label";
import { getTodayWindow } from "@/lib/operations-center/get-today-window";
import { resolveOperationContext } from "@/lib/operations-center/resolve-operation-context";
import { getDefaultMealTypeForTimeOfDay } from "@/lib/servery-meal-service";

import type { ResolveActiveOperationHeuristicHints, ResolvedActiveOperation } from "./types";

export function resolveHeuristicActiveOperation(input: {
  facilityId: string;
  departmentId: string;
  now?: Date;
  heuristicHints?: ResolveActiveOperationHeuristicHints;
}): ResolvedActiveOperation {
  const now = input.now ?? new Date();
  const serviceDate = getTodayWindow(now).start;

  if (input.heuristicHints) {
    const operationContext = resolveOperationContext({
      now,
      unitCards: input.heuristicHints.unitCards,
      mealBoards: input.heuristicHints.mealBoards,
    });

    return {
      source: "heuristic",
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate,
      operationInstanceId: null,
      operationDefinitionId: null,
      instanceStatus: null,
      label: operationContext.serviceLabel,
      operationContext,
    };
  }

  const mealType = getDefaultMealTypeForTimeOfDay(now);
  const mealLabel = fmtMealLabel(mealType);

  return {
    source: "heuristic",
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    serviceDate,
    operationInstanceId: null,
    operationDefinitionId: null,
    instanceStatus: null,
    label: `${mealLabel} service`,
    operationContext: {
      mealType,
      mealLabel,
      serviceLabel: `${mealLabel} service`,
      phase: "Preparation",
      scheduledTimeLabel: null,
      minutesUntilService: null,
    },
  };
}
