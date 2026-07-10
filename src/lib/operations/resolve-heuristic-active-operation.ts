import { fmtMealLabel } from "@/lib/operations-center/fmt-meal-label";
import { resolveOperationContext } from "@/lib/operations-center/resolve-operation-context";
import { getFacilityServiceDate, resolveFacilityTimezone } from "@/lib/operational-time";
import { getDefaultMealTypeForTimeOfDay } from "@/lib/servery-meal-service";
import { resolveUnitOperationContext } from "@/lib/unit-workspace/resolve-unit-operation-context";

import type {
  ResolveActiveOperationHeuristicHints,
  ResolveActiveOperationUnitHeuristicHints,
  ResolvedActiveOperation,
} from "./types";

export function resolveHeuristicActiveOperation(input: {
  facilityId: string;
  departmentId: string;
  now?: Date;
  facilityTimezone?: string | null;
  heuristicHints?: ResolveActiveOperationHeuristicHints;
  unitHeuristicHints?: ResolveActiveOperationUnitHeuristicHints;
}): ResolvedActiveOperation {
  const now = input.now ?? new Date();
  const facilityTimezone = resolveFacilityTimezone(input.facilityTimezone);
  const serviceDate = getFacilityServiceDate(facilityTimezone, now);

  if (input.unitHeuristicHints) {
    const operationContext = resolveUnitOperationContext({
      unit: input.unitHeuristicHints.unit,
      mealServiceEventByMeal: input.unitHeuristicHints.mealServiceEventByMeal,
      now,
      facilityTimezone,
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

  if (input.heuristicHints) {
    const operationContext = resolveOperationContext({
      now,
      unitCards: input.heuristicHints.unitCards,
      mealBoards: input.heuristicHints.mealBoards,
      facilityTimezone,
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

  const mealType = getDefaultMealTypeForTimeOfDay(now, facilityTimezone);
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
