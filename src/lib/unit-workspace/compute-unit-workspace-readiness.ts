import type { MealType } from "@prisma/client";
import { UnitType } from "@prisma/client";

import type { OperationContext } from "@/lib/operations-center";
import { computeUnitReadiness } from "@/lib/readiness";
import { deriveEvsRoomAreaSignals } from "@/lib/readiness/evs-room-signals";
import { computeMealScopedLogCounts } from "@/lib/readiness/meal-scoped-log-counts";
import {
  applyPmScheduleSignals,
  emptyPlantUnitSignals,
  groupOutOfServiceAssetsByUnit,
} from "@/lib/readiness/plant-asset-signals";
import { mealLabelForType, resolveUnitProfileKey } from "@/lib/readiness/profiles";
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
  if (input.unit.unitType !== UnitType.SERVERY) {
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
  queries: Pick<
    UnitQueryResult,
    | "openRepairs"
    | "assignments"
    | "submissions"
    | "schedulesToday"
    | "roomAreaStatusToday"
    | "outOfServiceAssets"
    | "pmSchedulesDueThroughToday"
  >;
  mealServiceEventByMeal: Map<MealType, UnitWorkspaceMealServiceEventToday>;
  operationContext: OperationContext;
  failed?: number;
  missed?: number;
  pending?: number;
  expected?: number;
  completed?: number;
  effectiveCoverage: number;
  now: Date;
  facilityTimezone?: string | null;
  activeDepartmentKey?: "DIETARY" | "EVS" | "PLANT" | null;
}): UnitReadiness {
  const logCounts = computeMealScopedLogCounts({
    assignments: input.queries.assignments,
    submissions: input.queries.submissions,
    unitId: input.unit.id,
    mealType: input.operationContext.mealType,
  });

  const openRepairs = input.queries.openRepairs;
  const urgentRepairs = openRepairs.filter((repair) => repair.priority === "URGENT");
  const highRepairs = openRepairs.filter((repair) => repair.priority === "HIGH");
  const significant = openRepairs.filter(
    (repair) => repair.priority === "URGENT" || repair.priority === "HIGH",
  );
  const normal = openRepairs.filter(
    (repair) => repair.priority === "MEDIUM" || repair.priority === "LOW",
  );
  const activelyWorked = significant.filter((repair) => repair.status === "IN_PROGRESS");

  const profileKey = resolveUnitProfileKey({
    activeDepartmentKey: input.activeDepartmentKey,
    unitDepartmentKeys: [],
    unitType: input.unit.unitType,
  });

  const evsRoom = deriveEvsRoomAreaSignals(input.queries.roomAreaStatusToday);

  const underwayPmScheduleIds = new Set<string>();
  for (const repair of openRepairs) {
    if (
      repair.workOrderKind === "PREVENTIVE" &&
      repair.preventiveScheduleId &&
      (repair.status === "IN_PROGRESS" || repair.assignedEmployeeId)
    ) {
      underwayPmScheduleIds.add(repair.preventiveScheduleId);
    }
  }

  const plantByUnit = groupOutOfServiceAssetsByUnit(
    input.queries.outOfServiceAssets ?? [],
    input.queries.openRepairs,
    input.now,
  );
  applyPmScheduleSignals({
    byUnit: plantByUnit,
    schedules: input.queries.pmSchedulesDueThroughToday ?? [],
    now: input.now,
    underwayScheduleIds: underwayPmScheduleIds,
  });
  const plant = plantByUnit.get(input.unit.id) ?? emptyPlantUnitSignals();

  return computeUnitReadiness(
    {
      unitId: input.unit.id,
      unitName: input.unit.name,
      unitType: input.unit.unitType,
      failed: logCounts.failed,
      missed: logCounts.missed,
      pending: logCounts.pending,
      expected: logCounts.expected,
      completed: logCounts.completed,
      staffingCount: input.effectiveCoverage,
      openRepairCount: openRepairs.length,
      urgentRepairCount: urgentRepairs.length,
      highRepairCount: highRepairs.length,
      serveryMealNotLive: resolveServeryMealNotLive(input),
      operationPhase: input.operationContext.phase,
      profileKey,
      mealLabel: mealLabelForType(input.operationContext.mealType),
      primaryUrgentRepairTitle: urgentRepairs[0]?.title ?? null,
      primaryHighRepairTitle: highRepairs[0]?.title ?? null,
      assignedSignificantRepairCount: significant.filter(
        (repair) => repair.assignedEmployeeId || repair.status === "IN_PROGRESS",
      ).length,
      unassignedUrgentOrHighCount: significant.filter((repair) => !repair.assignedEmployeeId).length,
      overdueCriticalRepairCount: significant.filter(
        (repair) => repair.dueAt && repair.dueAt.getTime() <= input.now.getTime(),
      ).length,
      normalPriorityOpenRepairCount: normal.length,
      assignedNormalRepairCount: normal.filter(
        (repair) => repair.assignedEmployeeId || repair.status === "IN_PROGRESS",
      ).length,
      preventiveMaintenanceInProgressCount: openRepairs.filter(
        (repair) => repair.workOrderKind === "PREVENTIVE" && repair.status === "IN_PROGRESS",
      ).length,
      requiresEvsCoverage: profileKey === "EVS" && input.queries.schedulesToday.length > 0,
      ...evsRoom,
      ...plant,
      significantActivelyWorkedCount: activelyWorked.length,
      urgentNotActivelyWorkedCount: urgentRepairs.filter(
        (repair) => repair.status !== "IN_PROGRESS",
      ).length,
      primarySignificantInProgressTitle: activelyWorked[0]?.title ?? null,
    },
    {
      now: input.now,
      facilityTimezone: input.facilityTimezone,
      minutesUntilService: input.operationContext.minutesUntilService,
    },
  );
}
