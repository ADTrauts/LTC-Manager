import { UnitType } from "@prisma/client";

import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { buildDashboardAggregates } from "@/lib/operations-center/build-dashboard-aggregates";
import type { DashboardQueryResult } from "@/lib/operations-center/load-dashboard-queries";
import type { OperationContext } from "@/lib/operations-center/types";
import { buildOperationalTimeContext } from "@/lib/operational-time";
import { isWithinServeryLiveWindow } from "@/lib/servery-meal-service";

import { computeUnitReadiness, summarizeReadiness } from "./compute-unit-readiness";
import { computeMealScopedLogCounts } from "./meal-scoped-log-counts";
import { mealLabelForType, resolveUnitProfileKey } from "./profiles";
import type { ReadinessBatchResult, UnitReadinessSignals } from "./types";

type RepairPriorityRow = {
  id: string;
  unitId: string;
  priority: string;
  title?: string | null;
  status?: string | null;
  workOrderKind?: string | null;
  assignedEmployeeId?: string | null;
  dueAt?: Date | null;
};

type RepairSignalCounts = {
  urgent: number;
  high: number;
  total: number;
  primaryUrgentRepairTitle: string | null;
  primaryHighRepairTitle: string | null;
  assignedSignificantRepairCount: number;
  unassignedUrgentOrHighCount: number;
  overdueCriticalRepairCount: number;
  normalPriorityOpenRepairCount: number;
  assignedNormalRepairCount: number;
  preventiveMaintenanceInProgressCount: number;
};

function isAssigned(repair: RepairPriorityRow): boolean {
  return Boolean(repair.assignedEmployeeId) || repair.status === "IN_PROGRESS";
}

function groupRepairSignals(
  repairs: RepairPriorityRow[],
  now: Date,
): Map<string, RepairSignalCounts> {
  const byUnit = new Map<string, RepairSignalCounts>();

  for (const repair of repairs) {
    const current = byUnit.get(repair.unitId) ?? {
      urgent: 0,
      high: 0,
      total: 0,
      primaryUrgentRepairTitle: null,
      primaryHighRepairTitle: null,
      assignedSignificantRepairCount: 0,
      unassignedUrgentOrHighCount: 0,
      overdueCriticalRepairCount: 0,
      normalPriorityOpenRepairCount: 0,
      assignedNormalRepairCount: 0,
      preventiveMaintenanceInProgressCount: 0,
    };

    current.total += 1;
    const significant = repair.priority === "URGENT" || repair.priority === "HIGH";
    const assigned = isAssigned(repair);
    const dueAt = repair.dueAt ?? null;
    const overdue = Boolean(dueAt && dueAt.getTime() <= now.getTime());
    const title = "title" in repair ? (repair.title ?? null) : null;

    if (repair.priority === "URGENT") {
      current.urgent += 1;
      if (!current.primaryUrgentRepairTitle) current.primaryUrgentRepairTitle = title;
    }
    if (repair.priority === "HIGH") {
      current.high += 1;
      if (!current.primaryHighRepairTitle) current.primaryHighRepairTitle = title;
    }

    if (significant && assigned) current.assignedSignificantRepairCount += 1;
    if (significant && !repair.assignedEmployeeId) current.unassignedUrgentOrHighCount += 1;
    if (significant && overdue) current.overdueCriticalRepairCount += 1;

    if (repair.priority === "MEDIUM" || repair.priority === "LOW") {
      current.normalPriorityOpenRepairCount += 1;
      if (assigned) current.assignedNormalRepairCount += 1;
    }

    if (repair.workOrderKind === "PREVENTIVE" && repair.status === "IN_PROGRESS") {
      current.preventiveMaintenanceInProgressCount += 1;
    }

    byUnit.set(repair.unitId, current);
  }

  return byUnit;
}

function buildServeryNotLiveUnitIds(input: {
  units: DashboardQueryResult["units"];
  events: DashboardQueryResult["serveryMealServiceEventsToday"];
  operationContext: OperationContext;
  now: Date;
}): Set<string> {
  const notLive = new Set<string>();
  const mealType = input.operationContext.mealType;

  for (const unit of input.units) {
    if (unit.unitType !== UnitType.SERVERY) continue;
    if (!unit.mealTimes.some((slot) => slot.mealType === mealType)) continue;

    const event = input.events.find(
      (row) => row.unitId === unit.id && row.mealType === mealType,
    );
    const readyLive = event?.mealServiceReadyAt
      ? isWithinServeryLiveWindow(event.mealServiceReadyAt, input.now)
      : false;
    const startedLive = event?.mealServiceStartedAt
      ? isWithinServeryLiveWindow(event.mealServiceStartedAt, input.now)
      : false;

    if (!readyLive && !startedLive) {
      notLive.add(unit.id);
    }
  }

  return notLive;
}

export type ComputeReadinessBatchInput = DashboardQueryResult & {
  now: Date;
  activeDepartmentKey?: OperationalDepartmentKey | null;
  facilityTimezone?: string | null;
  /** When provided (e.g. from Operation Engine), prefer this over aggregate heuristic. */
  operationContextOverride?: OperationContext;
};

export function computeReadinessBatch(input: ComputeReadinessBatchInput): ReadinessBatchResult {
  const dashboard = buildDashboardAggregates(input);
  const operationContext = input.operationContextOverride ?? dashboard.operationContext;
  const mealLabel = mealLabelForType(operationContext.mealType);
  const operationalTime = buildOperationalTimeContext({
    now: input.now,
    facilityTimezone: input.facilityTimezone,
    mealType: operationContext.mealType,
    mealLabel,
    operationPhase: operationContext.phase,
    scheduledStartLocal: null,
    minutesUntilService: operationContext.minutesUntilService,
  });

  const repairCountsByUnit = groupRepairSignals(input.openRepairs, input.now);
  const serveryNotLiveUnitIds = buildServeryNotLiveUnitIds({
    units: input.units,
    events: input.serveryMealServiceEventsToday,
    operationContext,
    now: input.now,
  });

  // Staffing presence by unit — used as a soft EVS coverage expectation signal.
  const staffingUnitIds = new Set<string>();
  for (const entry of input.scheduleEntriesToday) {
    staffingUnitIds.add(entry.unitId);
  }
  for (const override of input.overridesToday) {
    if (override.newUnitId) staffingUnitIds.add(override.newUnitId);
  }

  const items = dashboard.unitCards.map((unit) => {
    const unitMeta = input.units.find((row) => row.id === unit.id);
    const departmentKeys =
      unitMeta?.departmentResponsibilities.map((row) => row.department.key) ?? [];
    const profileKey = resolveUnitProfileKey({
      activeDepartmentKey: input.activeDepartmentKey,
      unitDepartmentKeys: departmentKeys,
      unitType: unit.unitType,
    });

    const logCounts = computeMealScopedLogCounts({
      assignments: input.assignments,
      submissions: input.submissionsToday,
      unitId: unit.id,
      mealType: operationContext.mealType,
    });

    const repairs = repairCountsByUnit.get(unit.id) ?? {
      urgent: 0,
      high: 0,
      total: 0,
      primaryUrgentRepairTitle: null,
      primaryHighRepairTitle: null,
      assignedSignificantRepairCount: 0,
      unassignedUrgentOrHighCount: 0,
      overdueCriticalRepairCount: 0,
      normalPriorityOpenRepairCount: 0,
      assignedNormalRepairCount: 0,
      preventiveMaintenanceInProgressCount: 0,
    };

    const signals: UnitReadinessSignals = {
      unitId: unit.id,
      unitName: unit.name,
      unitType: unit.unitType,
      failed: logCounts.failed,
      missed: logCounts.missed,
      pending: logCounts.pending,
      expected: logCounts.expected,
      completed: logCounts.completed,
      staffingCount: unit.staffingCount,
      openRepairCount: unit.openRepairCount,
      urgentRepairCount: repairs.urgent,
      highRepairCount: repairs.high,
      serveryMealNotLive: serveryNotLiveUnitIds.has(unit.id),
      operationPhase: operationContext.phase,
      profileKey,
      mealLabel,
      primaryUrgentRepairTitle: repairs.primaryUrgentRepairTitle,
      primaryHighRepairTitle: repairs.primaryHighRepairTitle,
      assignedSignificantRepairCount: repairs.assignedSignificantRepairCount,
      unassignedUrgentOrHighCount: repairs.unassignedUrgentOrHighCount,
      overdueCriticalRepairCount: repairs.overdueCriticalRepairCount,
      normalPriorityOpenRepairCount: repairs.normalPriorityOpenRepairCount,
      assignedNormalRepairCount: repairs.assignedNormalRepairCount,
      preventiveMaintenanceInProgressCount: repairs.preventiveMaintenanceInProgressCount,
      requiresEvsCoverage: profileKey === "EVS" && staffingUnitIds.has(unit.id),
    };

    return computeUnitReadiness(signals, {
      now: input.now,
      facilityTimezone: input.facilityTimezone,
      minutesUntilService: operationContext.minutesUntilService,
    });
  });

  return {
    items,
    byUnitId: new Map(items.map((item) => [item.unitId, item])),
    summary: summarizeReadiness(items),
    operationContext,
    unitCards: dashboard.unitCards,
    operationalTime,
  };
}
