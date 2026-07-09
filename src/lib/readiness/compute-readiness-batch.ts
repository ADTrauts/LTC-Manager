import { UnitType } from "@prisma/client";

import { buildDashboardAggregates } from "@/lib/operations-center/build-dashboard-aggregates";
import type { DashboardQueryResult } from "@/lib/operations-center/load-dashboard-queries";
import type { OperationContext, OperationsCenterMealBoard } from "@/lib/operations-center/types";

import { computeUnitReadiness, summarizeReadiness } from "./compute-unit-readiness";
import type { ReadinessBatchResult, UnitReadinessSignals } from "./types";

type RepairPriorityRow = DashboardQueryResult["openRepairs"][number];

type RepairPriorityCounts = {
  urgent: number;
  high: number;
  total: number;
};

function groupRepairPriorityCounts(repairs: RepairPriorityRow[]): Map<string, RepairPriorityCounts> {
  const byUnit = new Map<string, RepairPriorityCounts>();

  for (const repair of repairs) {
    const current = byUnit.get(repair.unitId) ?? { urgent: 0, high: 0, total: 0 };
    current.total += 1;
    if (repair.priority === "URGENT") current.urgent += 1;
    if (repair.priority === "HIGH") current.high += 1;
    byUnit.set(repair.unitId, current);
  }

  return byUnit;
}

function buildServeryNotLiveUnitIds(
  mealBoards: OperationsCenterMealBoard[],
  operationContext: OperationContext,
): Set<string> {
  const notLive = new Set<string>();
  if (operationContext.phase !== "Execution") {
    return notLive;
  }

  const board = mealBoards.find((item) => item.meal === operationContext.mealType);
  if (!board) {
    return notLive;
  }

  for (const row of board.rows) {
    if (row.unitType === UnitType.SERVERY && row.statusLabel === "—") {
      notLive.add(row.unitId);
    }
  }

  return notLive;
}

export function computeReadinessBatch(input: DashboardQueryResult & { now: Date }): ReadinessBatchResult {
  const dashboard = buildDashboardAggregates(input);
  const repairCountsByUnit = groupRepairPriorityCounts(input.openRepairs);
  const serveryNotLiveUnitIds = buildServeryNotLiveUnitIds(dashboard.mealBoards, dashboard.operationContext);

  const items = dashboard.unitCards.map((unit) => {
    const repairs = repairCountsByUnit.get(unit.id) ?? { urgent: 0, high: 0, total: 0 };
    const signals: UnitReadinessSignals = {
      unitId: unit.id,
      unitName: unit.name,
      unitType: unit.unitType,
      failed: unit.failed,
      missed: unit.missed,
      pending: unit.pending,
      expected: unit.expected,
      completed: unit.completed,
      staffingCount: unit.staffingCount,
      openRepairCount: unit.openRepairCount,
      urgentRepairCount: repairs.urgent,
      highRepairCount: repairs.high,
      serveryMealNotLive: serveryNotLiveUnitIds.has(unit.id),
      operationPhase: dashboard.operationContext.phase,
    };

    return computeUnitReadiness(signals);
  });

  return {
    items,
    byUnitId: new Map(items.map((item) => [item.unitId, item])),
    summary: summarizeReadiness(items),
    operationContext: dashboard.operationContext,
    unitCards: dashboard.unitCards,
  };
}
